import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { notifyAdmin } from '../../shared/notify';

/** Flujo de limpieza RIZZOS: iniciar limpieza (recoger ropa con estado OK/ROBADA/DETERIORADA)
 *  → habitación EN CURSO → finalizar limpieza → Disponible. */

// MAINTENANCE entra aquí porque el admin manda a limpieza las habitaciones "muy sucias"
// (ver manual): el personal de limpieza las atiende y, al finalizar, vuelven a Disponible.
const CLEANABLE = ['CLEANING', 'LIMPIEZA_EN_ESPERA', 'LIMPIEZA_EN_CURSO', 'LIMPIEZA_SOLICITADA', 'REQUIERE_REPASO', 'MAINTENANCE'];

export const startSchema = z.object({
  inspections: z
    .array(
      z.object({
        linenItemId: z.string().min(1).optional(),
        description: z.string().min(1).max(200),
        state: z.enum(['OK', 'ROBADA', 'DETERIORADA']).default('OK'),
        pickup: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type StartDto = z.infer<typeof startSchema>;

export const requestLinenSchema = z.object({
  items: z.array(z.object({ linenItemId: z.string().min(1), floor: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
});
export const laundrySchema = z.object({
  linenItemId: z.string().min(1),
  floor: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  reason: z.string().max(200).optional(),
});
export type RequestLinenDto = z.infer<typeof requestLinenSchema>;
export type LaundryDto = z.infer<typeof laundrySchema>;

export const revisionSchema = z.object({
  roomId: z.string().min(1),
  status: z.enum(['OK', 'ISSUE']).default('OK'),
  tipoFalla: z.string().max(300).optional(),
  acciones: z.array(z.string().max(120)).default([]),
  observaciones: z.string().max(1000).optional().or(z.literal('')),
  photo: z.string().optional(), // data URL (base64) capturada en el navegador
});
export type RevisionDto = z.infer<typeof revisionSchema>;

export const finishSchema = z.object({
  problems: z.array(z.object({
    category: z.string().max(60),
    falla: z.string().max(120).optional().or(z.literal('')),
    observacion: z.string().max(500).optional().or(z.literal('')),
  })).default([]),
  observacionesGenerales: z.string().max(1000).optional().or(z.literal('')),
});
export type FinishDto = z.infer<typeof finishSchema>;

export const cleaningService = {
  /** Ítems de ropa de la sucursal (para el modal de recoger ropa). */
  async linenItems(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    return items.map((i) => ({ id: i.id, type: i.type, name: i.name, color: i.color, reusable: i.reusable }));
  },

  /** Habitaciones que requieren limpieza/repaso, con su tarea en curso si existe. */
  async roomsToClean(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rooms = await prisma.room.findMany({
      where: { branchId, status: { in: [...CLEANABLE, 'REVISION'] } },
      include: { roomType: { select: { name: true } } },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
    const tasks = await prisma.housekeepingTask.findMany({ where: { branchId, status: 'IN_PROGRESS' } });
    const taskByRoom = new Map(tasks.map((t) => [t.roomId, t.id]));
    const startedByRoom = new Map(tasks.map((t) => [t.roomId, t.createdAt]));
    // Revisión periódica en curso: revisiones PENDING (su createdAt = inicio del cronómetro).
    const pendingRevs = await prisma.revision.findMany({ where: { branchId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
    const revStartByRoom = new Map<string, Date>();
    for (const rv of pendingRevs) if (!revStartByRoom.has(rv.roomId)) revStartByRoom.set(rv.roomId, rv.createdAt);
    return rooms.map((r) => ({
      id: r.id,
      number: r.number,
      floor: r.floor,
      status: r.status,
      typeName: r.roomType.name,
      repaso: r.status === 'REQUIERE_REPASO',
      mantenimiento: r.status === 'MAINTENANCE',
      enCurso: r.status === 'LIMPIEZA_EN_CURSO' || taskByRoom.has(r.id),
      revision: r.status === 'REVISION',
      taskId: taskByRoom.get(r.id) ?? null,
      startedAt: startedByRoom.get(r.id) ?? revStartByRoom.get(r.id) ?? null,
    }));
  },

  /** Inicia la limpieza: crea la tarea con la inspección de ropa y deja la habitación EN CURSO. */
  async start(scope: RequestScope, roomId: string, dto: StartDto) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    if (!CLEANABLE.includes(room.status)) throw new ValidationError('La habitación no está pendiente de limpieza');

    const task = await prisma.housekeepingTask.create({
      data: {
        branchId,
        roomId,
        assignedToUserId: scope.userId,
        status: 'IN_PROGRESS',
        result: 'PENDING',
        linenInspections: {
          create: dto.inspections.map((i) => ({
            description: i.description,
            linenItemId: i.linenItemId ?? null,
            state: i.state,
            pickup: i.pickup,
          })),
        },
      },
    });
    await prisma.room.update({ where: { id: roomId }, data: { status: 'LIMPIEZA_EN_CURSO' } });
    return { taskId: task.id };
  },

  /** Finaliza la limpieza: cierra la tarea y deja la habitación Disponible. */
  async finish(scope: RequestScope, roomId: string, dto?: FinishDto) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    const task = await prisma.housekeepingTask.findFirst({ where: { branchId, roomId, status: 'IN_PROGRESS' } });
    if (task) {
      await prisma.housekeepingTask.update({ where: { id: task.id }, data: { status: 'DONE', result: 'APPROVED', completedAt: new Date() } });
    }
    const problems = dto?.problems ?? [];
    if (problems.length) {
      // "No, hay problemas": se registra un mantenimiento y la habitación queda bloqueada.
      const desc = problems.map((p) => `${p.category}${p.falla ? ' · ' + p.falla : ''}${p.observacion ? ': ' + p.observacion : ''}`).join('\n')
        + (dto?.observacionesGenerales ? `\n\nGenerales: ${dto.observacionesGenerales}` : '');
      await prisma.maintenance.create({
        data: { branchId, roomId, title: `Problemas en limpieza (Hab. ${room.number})`, description: desc, status: 'OPEN', createdByUserId: scope.userId },
      });
      await prisma.room.update({ where: { id: roomId }, data: { status: 'MAINTENANCE' } });
      return { ok: true, maintenance: true };
    }
    // Todo OK → habitación disponible.
    await prisma.room.update({ where: { id: roomId }, data: { status: 'FREE' } });
    return { ok: true, maintenance: false };
  },

  // ── Turno de limpieza ──
  async shift(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const shift = await prisma.cleaningShift.findFirst({ where: { branchId, userId: scope.userId, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
    const inProgress = await prisma.housekeepingTask.count({ where: { branchId, status: 'IN_PROGRESS' } });
    return { shift, inProgress, canClose: inProgress === 0 };
  },

  async openShift(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const existing = await prisma.cleaningShift.findFirst({ where: { branchId, userId: scope.userId, status: 'OPEN' } });
    if (existing) return existing;
    const hour = new Date().getHours();
    const shiftType = hour < 15 ? 'MANANA' : 'TARDE';
    return prisma.cleaningShift.create({ data: { branchId, userId: scope.userId, shiftType, status: 'OPEN' } });
  },

  async markLaundrySent(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const shift = await prisma.cleaningShift.findFirst({ where: { branchId, userId: scope.userId, status: 'OPEN' } });
    if (!shift) throw new ValidationError('No hay turno abierto');
    return prisma.cleaningShift.update({ where: { id: shift.id }, data: { laundrySent: true } });
  },

  async closeShift(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const shift = await prisma.cleaningShift.findFirst({ where: { branchId, userId: scope.userId, status: 'OPEN' } });
    if (!shift) throw new ValidationError('No hay turno abierto');
    const inProgress = await prisma.housekeepingTask.count({ where: { branchId, status: 'IN_PROGRESS' } });
    if (inProgress > 0) throw new ValidationError('No puedes finalizar el turno con limpiezas en curso');
    if (!shift.laundrySent) throw new ValidationError('Debes enviar la ropa a lavandería antes de finalizar el turno');
    return prisma.cleaningShift.update({ where: { id: shift.id }, data: { status: 'CLOSED', closedAt: new Date() } });
  },

  /** Reporte del turno/día: ropa por pisos, limpiezas y mantenimientos, ropa a lavandería. */
  async turnoReport(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const inv = await this.linenInventory(scope);
    const [cleaningsDone, maintenances, laundry] = await Promise.all([
      prisma.housekeepingTask.count({ where: { branchId, status: { in: ['DONE', 'INSPECTED'] }, completedAt: { gte: start } } }),
      prisma.maintenance.count({ where: { branchId, createdAt: { gte: start } } }),
      prisma.linenMovement.aggregate({ where: { branchId, type: 'LAUNDRY', createdAt: { gte: start } }, _sum: { quantity: true } }),
    ]);
    const totalRem = inv.floors.reduce((a, f) => a + f.rows.reduce((b, r) => b + r.rem, 0), 0);
    const totalSum = inv.floors.reduce((a, f) => a + f.rows.reduce((b, r) => b + r.sum, 0), 0);
    return {
      floors: inv.floors,
      totals: { rem: totalRem, sum: totalSum },
      cleaningsDone,
      maintenances,
      laundryItems: Math.abs(laundry._sum.quantity ?? 0),
    };
  },

  /** Ítems a reponer al finalizar (lo recogido en la inspección de inicio). */
  async reposicion(scope: RequestScope, roomId: string) {
    const branchId = requireActiveBranch(scope);
    const task = await prisma.housekeepingTask.findFirst({
      where: { branchId, roomId, status: 'IN_PROGRESS' },
      include: { linenInspections: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!task) return { ropa: [], amenities: [] };
    const ids = task.linenInspections.map((i) => i.linenItemId).filter((x): x is string => !!x);
    const linen = await prisma.linenItem.findMany({ where: { id: { in: ids } } });
    const lmap = new Map(linen.map((l) => [l.id, l]));
    const rows = task.linenInspections.map((i) => {
      const li = i.linenItemId ? lmap.get(i.linenItemId) : null;
      const isAmenity = li?.type === 'AMENITY';
      return {
        section: isAmenity ? 'amenity' : 'ropa',
        tipo: 'BASE',
        name: i.description,
        code: i.linenItemId ? i.linenItemId.slice(-7).toUpperCase() : '—',
        type: li?.type ?? null,
        color: li?.color ?? null,
        cant: i.pickup ? 1 : 0,
        mantiene: !i.pickup,
        motivo: i.pickup
          ? (isAmenity ? 'Amenity recogido - Reponer desde inv. limpieza' : `Ropa recogida - Reponer desde inv. limpieza (${li?.name ?? ''})`)
          : 'Permanece en habitación',
      };
    });
    return { ropa: rows.filter((r) => r.section === 'ropa'), amenities: rows.filter((r) => r.section === 'amenity') };
  },

  /** Inicia una revisión periódica: pone la habitación EN REVISIÓN y arranca el cronómetro. */
  async startRevision(scope: RequestScope, roomId: string) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    if (room.status === 'OCCUPIED') throw new ValidationError('No se puede revisar una habitación ocupada');
    // Marca de inicio: una revisión PENDING (su createdAt es el inicio del cronómetro).
    const existing = await prisma.revision.findFirst({ where: { branchId, roomId, status: 'PENDING' } });
    if (!existing) await prisma.revision.create({ data: { branchId, roomId, status: 'PENDING', createdByUserId: scope.userId } });
    await prisma.room.update({ where: { id: roomId }, data: { status: 'REVISION' } });
    return { ok: true };
  },

  /** Revisión periódica de una habitación (acciones, tipo de falla, observaciones, foto). */
  async revisionPeriodica(scope: RequestScope, dto: RevisionDto) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    // notes es NVARCHAR(1000): no guardamos la foto base64 (desborda) — solo una marca; observaciones acotadas.
    const detail = JSON.stringify({
      tipoFalla: (dto.tipoFalla || '').slice(0, 300) || null,
      acciones: dto.acciones,
      observaciones: (dto.observaciones || '').slice(0, 300) || null,
      hasPhoto: !!dto.photo,
    });
    // Si había una revisión en curso (PENDING, iniciada con play), se finaliza esa; si no, se crea.
    const pending = await prisma.revision.findFirst({ where: { branchId, roomId: dto.roomId, status: 'PENDING' } });
    const rev = pending
      ? await prisma.revision.update({ where: { id: pending.id }, data: { status: dto.status, notes: detail, createdByUserId: scope.userId } })
      : await prisma.revision.create({ data: { branchId, roomId: dto.roomId, status: dto.status, notes: detail, createdByUserId: scope.userId } });
    // "Todo OK" certifica la habitación → Disponible (salvo que esté ocupada).
    // Con observación → queda en MAINTENANCE para que se resuelva la falla.
    if (room.status !== 'OCCUPIED') {
      await prisma.room.update({ where: { id: dto.roomId }, data: { status: dto.status === 'OK' ? 'FREE' : 'MAINTENANCE' } });
    }
    return { id: rev.id };
  },

  /** Historial de revisiones de una habitación (detalle enriquecido para el modal de historial). */
  async revisions(scope: RequestScope, roomId?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.revision.findMany({ where: { branchId, ...(roomId ? { roomId } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
    const roomIds = [...new Set(rows.map((r) => r.roomId))];
    const [rooms, users] = await Promise.all([
      prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }),
      prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdByUserId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    ]);
    const rmap = new Map(rooms.map((r) => [r.id, r.number]));
    const umap = new Map(users.map((u) => [u.id, u.name]));
    // Categorías consideradas críticas (resaltan con badge "Crítico").
    const CRITICAL_CATS = ['ELECTRICIDAD', 'BAÑO', 'BANO', 'PLOMERÍA', 'PLOMERIA', 'ARTEFACTOS', 'PUERTA'];
    const turnoOf = (d: Date): string => { const h = d.getHours(); return h >= 7 && h < 15 ? 'M' : h >= 15 && h < 23 ? 'T' : 'N'; };
    return rows.map((r) => {
      let detail: { tipoFalla?: string | null; acciones?: string[]; observaciones?: string | null; hasPhoto?: boolean } = {};
      try { detail = r.notes ? JSON.parse(r.notes) : {}; } catch { detail = { observaciones: r.notes }; }
      // Fallas: "CATEGORÍA: descripción · CATEGORÍA2: descripción2"
      const fallas = (detail.tipoFalla || '')
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((part) => {
          const i = part.indexOf(':');
          const category = (i >= 0 ? part.slice(0, i) : 'GENERAL').trim();
          const description = (i >= 0 ? part.slice(i + 1) : part).trim();
          const critical = CRITICAL_CATS.some((c) => category.toUpperCase().includes(c));
          return { category, description, critical };
        });
      const acciones = detail.acciones ?? [];
      const finished = r.status !== 'PENDING';
      const minutes = finished ? Math.max(0, Math.round((r.updatedAt.getTime() - r.createdAt.getTime()) / 60_000)) : Math.round((Date.now() - r.createdAt.getTime()) / 60_000);
      return {
        id: r.id,
        room: rmap.get(r.roomId) ?? '—',
        status: r.status,
        estado: r.status === 'OK' ? 'Bueno' : r.status === 'ISSUE' ? 'Intermedio' : 'En curso',
        tipo: acciones.length ? 'Periódico' : 'Preventivo',
        turno: turnoOf(r.createdAt),
        collaborator: r.createdByUserId ? (umap.get(r.createdByUserId) ?? '—') : '—',
        minutes,
        createdAt: r.createdAt,
        finishedAt: finished ? r.updatedAt : null,
        tipoFalla: detail.tipoFalla ?? null,
        acciones,
        observaciones: detail.observaciones ?? null,
        hasPhoto: !!detail.hasPhoto,
        fallas,
      };
    });
  },

  /** Tabla "Revisiones de Mantenimiento": una fila por habitación con su última revisión. */
  async maintenanceRevisions(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [rooms, revisions] = await Promise.all([
      prisma.room.findMany({ where: { branchId }, include: { roomType: { select: { name: true } } }, orderBy: [{ floor: 'asc' }, { number: 'asc' }] }),
      prisma.revision.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const userIds = [...new Set(revisions.map((r) => r.createdByUserId).filter((x): x is string => !!x))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const umap = new Map(users.map((u) => [u.id, u.name]));
    // Última revisión por habitación.
    const lastByRoom = new Map<string, (typeof revisions)[number]>();
    for (const r of revisions) if (!lastByRoom.has(r.roomId)) lastByRoom.set(r.roomId, r);

    const turno = (d: Date): string => {
      const h = d.getHours();
      if (h >= 7 && h < 15) return 'M';
      if (h >= 15 && h < 23) return 'T';
      return 'N';
    };

    return rooms.map((room) => {
      const rev = lastByRoom.get(room.id);
      let obs: string | null = null;
      if (rev?.notes) {
        try { obs = (JSON.parse(rev.notes) as { observaciones?: string | null }).observaciones ?? null; } catch { obs = rev.notes; }
      }
      const date = rev?.createdAt ?? null;
      return {
        roomId: room.id,
        number: room.number,
        floor: room.floor,
        typeName: room.roomType.name,
        occupied: room.status === 'OCCUPIED',
        date,
        turno: date ? turno(date) : '-',
        collaborator: rev?.createdByUserId ? (umap.get(rev.createdByUserId) ?? '-') : '-',
        minutes: date ? Math.floor((Date.now() - date.getTime()) / 60_000) : null,
        tipo: rev ? (rev.status === 'ISSUE' ? 'Acción Periódica' : 'Preventivo') : 'Preventivo',
        observacion: obs,
        status: rev?.status ?? 'PENDING',
      };
    });
  },

  /** Movimientos de inventario de ropa (Reposición/Entrada/Salida) para la tabla de Limpieza. */
  async linenMovements(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const moves = await prisma.linenMovement.findMany({
      where: { branchId },
      include: { linenItem: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const roomIds = [...new Set(moves.map((m) => m.roomId).filter((x): x is string => !!x))];
    const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } });
    const rmap = new Map(rooms.map((r) => [r.id, r.number]));

    // Etiqueta y áreas por tipo (cuando no vienen en el registro).
    const meta = (m: (typeof moves)[number]): { label: string; tone: string; from: string; to: string } => {
      const piso = m.floor ? `Limpieza P${m.floor}` : 'Limpieza';
      switch (m.type) {
        case 'TRANSFER':
          return { label: 'Entrada', tone: 'in', from: m.areaFrom ?? 'Almacén de Ropa', to: m.areaTo ?? piso };
        case 'SUPPLY':
          return { label: 'Reposición', tone: 'repo', from: m.areaFrom ?? piso, to: m.areaTo ?? 'Habitaciones' };
        case 'LAUNDRY':
          return { label: 'Salida', tone: 'out', from: m.areaFrom ?? 'Limpieza', to: m.areaTo ?? 'Lavandería' };
        case 'PICKUP':
          return { label: 'Entrada', tone: 'in', from: m.areaFrom ?? 'Habitaciones', to: m.areaTo ?? piso };
        case 'REQUEST':
          return { label: 'Solicitud', tone: 'req', from: piso, to: m.areaTo ?? 'Almacén de Ropa' };
        default:
          return { label: 'Ajuste', tone: 'adj', from: m.areaFrom ?? piso, to: m.areaTo ?? piso };
      }
    };

    return moves.map((m) => {
      const x = meta(m);
      return {
        id: m.id,
        article: m.linenItem.name,
        articleType: m.linenItem.type,
        type: m.type,
        label: x.label,
        tone: x.tone,
        quantity: m.quantity,
        room: m.roomId ? (rmap.get(m.roomId) ?? '—') : '—',
        floor: m.floor,
        areaFrom: x.from,
        areaTo: x.to,
        reference: m.reference,
        createdAt: m.createdAt,
      };
    });
  },

  /**
   * Historial de Limpieza agrupado por turno (Mañana/Tarde/Noche).
   * Una fila por tarea de limpieza finalizada (Check Out / Pernocta) y por suministro
   * entregado (Suministro). Incluye recogidos/dejados/repuestos de ropa y adicionales.
   */
  async history(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [tasks, rooms, stays, supplies] = await Promise.all([
      prisma.housekeepingTask.findMany({
        where: { branchId, status: { in: ['DONE', 'INSPECTED'] }, completedAt: { not: null } },
        include: { linenInspections: true },
        orderBy: { completedAt: 'desc' },
        take: 500,
      }),
      prisma.room.findMany({ where: { branchId }, select: { id: true, number: true, floor: true } }),
      prisma.stay.findMany({ where: { branchId }, select: { roomId: true, durationMinutes: true, checkInAt: true, checkOutAt: true }, orderBy: { checkInAt: 'desc' } }),
      prisma.roomSupply.findMany({ where: { branchId, status: 'DELIVERED' }, orderBy: { deliveredAt: 'desc' }, take: 500 }),
    ]);
    const rmap = new Map(rooms.map((r) => [r.id, r]));
    const userIds = [...new Set([...tasks.map((t) => t.assignedToUserId), ...supplies.map((s) => s.createdByUserId)].filter((x): x is string => !!x))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const umap = new Map(users.map((u) => [u.id, u.name]));

    const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dateLabel = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
    const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const turnoOf = (d: Date): { key: string; label: string; hours: string; order: number } => {
      const h = d.getHours();
      if (h >= 7 && h < 15) return { key: 'M', label: 'Mañana', hours: '07:00 - 15:00', order: 0 };
      if (h >= 15 && h < 23) return { key: 'T', label: 'Tarde', hours: '15:00 - 23:00', order: 1 };
      return { key: 'N', label: 'Noche', hours: '23:00 - 07:00', order: 2 };
    };
    const groupCount = (arr: { description: string }[]) => {
      const m = new Map<string, number>();
      for (const i of arr) m.set(i.description, (m.get(i.description) ?? 0) + 1);
      return [...m].map(([name, units]) => ({ name, units }));
    };
    const LIMIT_MIN = 30; // límite de duración antes de marcar "Excedido"

    type Row = ReturnType<typeof rowFrom> | ReturnType<typeof supplyRow>;
    const matchedSupplyIds = new Set<string>();

    function rowFrom(t: (typeof tasks)[number]) {
      const r = rmap.get(t.roomId)!;
      const recogidasInsp = t.linenInspections.filter((i) => i.pickup);
      const dejadasInsp = t.linenInspections.filter((i) => !i.pickup);
      const recogidos = groupCount(recogidasInsp);
      const winStart = t.createdAt.getTime() - 60 * 60 * 1000;
      const winEnd = (t.completedAt?.getTime() ?? Date.now()) + 60 * 60 * 1000;
      const adic = supplies.filter((s) => s.roomId === t.roomId && s.deliveredAt && s.deliveredAt.getTime() >= winStart && s.deliveredAt.getTime() <= winEnd);
      adic.forEach((s) => matchedSupplyIds.add(s.id));
      const stay = stays.find((s) => s.roomId === t.roomId && s.checkOutAt && Math.abs(s.checkOutAt.getTime() - t.createdAt.getTime()) < 24 * 60 * 60 * 1000) ?? stays.find((s) => s.roomId === t.roomId);
      const tipo = stay ? (stay.durationMinutes >= 600 ? 'PERNOCTA' : 'CHECKOUT') : 'CHECKOUT';
      const durationMinutes = t.completedAt ? Math.max(0, Math.round((t.completedAt.getTime() - t.createdAt.getTime()) / 60000)) : 0;
      return {
        id: t.id, kind: 'TASK', dateTime: t.createdAt, fin: t.completedAt, roomNumber: r.number, floor: r.floor, tipo,
        estado: 'Finalizado', durationMinutes, excedido: durationMinutes > LIMIT_MIN,
        recogidos, dejados: groupCount(dejadasInsp), repuestos: recogidos, // cada prenda recogida se repone con una limpia
        adicionales: adic.map((a) => ({ name: a.description, units: a.quantity, cortesia: true })),
        extra: adic.reduce((n, a) => n + a.quantity, 0),
        user: t.assignedToUserId ? (umap.get(t.assignedToUserId) ?? '—') : '—',
      };
    }
    function supplyRow(s: (typeof supplies)[number]) {
      const r = rmap.get(s.roomId);
      return {
        id: s.id, kind: 'SUPPLY', dateTime: s.deliveredAt ?? s.createdAt, fin: s.deliveredAt ?? s.createdAt,
        roomNumber: r?.number ?? '—', floor: r?.floor ?? null, tipo: 'SUMINISTRO',
        estado: 'Finalizado', durationMinutes: 0, excedido: false,
        recogidos: [] as { name: string; units: number }[], dejados: [] as { name: string; units: number }[], repuestos: [] as { name: string; units: number }[],
        adicionales: [{ name: s.description, units: s.quantity, cortesia: true }],
        extra: s.quantity,
        user: s.createdByUserId ? (umap.get(s.createdByUserId) ?? '—') : '—',
      };
    }

    const rows: Row[] = tasks.filter((t) => rmap.has(t.roomId)).map(rowFrom);
    // Suministros entregados que no quedaron como adicionales de una tarea → fila SUMINISTRO propia.
    for (const s of supplies) if (!matchedSupplyIds.has(s.id)) rows.push(supplyRow(s));

    // Agrupar por turno (fecha + Mañana/Tarde/Noche)
    const shiftMap = new Map<string, { dateISO: string; dateLabel: string; turnoKey: string; turnoLabel: string; hours: string; sortAt: number; rows: Row[] }>();
    for (const row of rows) {
      const d = row.dateTime;
      const t = turnoOf(d);
      const key = `${dateKey(d)}|${t.key}`;
      if (!shiftMap.has(key)) {
        shiftMap.set(key, { dateISO: d.toISOString(), dateLabel: dateLabel(d), turnoKey: t.key, turnoLabel: t.label, hours: t.hours, sortAt: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + t.order, rows: [] });
      }
      shiftMap.get(key)!.rows.push(row);
    }
    const shifts = [...shiftMap.values()]
      .sort((a, b) => b.sortAt - a.sortAt)
      .map((s) => ({ ...s, count: s.rows.length, rows: s.rows.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime()) }));
    return shifts;
  },

  /** Inventario de ropa por pisos: REM (remanente) y SUM (suministrado) por tipo/ítem. */
  async linenInventory(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [items, stocks] = await Promise.all([
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.linenStock.findMany({ where: { branchId } }),
    ]);
    const floors = [...new Set(stocks.map((s) => s.floor))].sort();
    const key = (li: string, f: string) => `${li}|${f}`;
    const stockMap = new Map(stocks.map((s) => [key(s.linenItemId, s.floor), s]));
    return {
      floors: floors.map((floor) => ({
        floor,
        rows: items.map((it) => {
          const s = stockMap.get(key(it.id, floor));
          return { linenItemId: it.id, type: it.type, name: it.name, color: it.color, rem: s?.rem ?? 0, sum: s?.sum ?? 0 };
        }),
      })),
    };
  },

  /** Solicita ropa al almacén/administrador (queda como movimiento REQUEST pendiente). */
  async requestLinen(scope: RequestScope, dto: RequestLinenDto) {
    const branchId = requireActiveBranch(scope);
    for (const i of dto.items) {
      await prisma.linenMovement.create({
        data: { branchId, linenItemId: i.linenItemId, type: 'REQUEST', quantity: i.quantity, floor: i.floor, reference: 'Solicitud de limpieza', createdByUserId: scope.userId },
      });
    }
    // Aviso al administrador por WhatsApp (best-effort; requiere notify.adminPhone configurado).
    const names = new Map(
      (await prisma.linenItem.findMany({ where: { id: { in: dto.items.map((i) => i.linenItemId) } }, select: { id: true, name: true } }))
        .map((x) => [x.id, x.name] as const),
    );
    const detail = dto.items.map((i) => `${i.quantity}× ${names.get(i.linenItemId) ?? 'ítem'} (piso ${i.floor})`).join(', ');
    await notifyAdmin(branchId, `🧺 RIZZOS · Solicitud de ropa de Limpieza: ${detail}.`);
    return { requested: dto.items.length };
  },

  /** Envía prenda manchada/deteriorada a lavandería (descuenta del remanente). */
  async sendToLaundry(scope: RequestScope, dto: LaundryDto) {
    const branchId = requireActiveBranch(scope);
    const stock = await prisma.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId: dto.linenItemId, floor: dto.floor } } });
    if (!stock || stock.branchId !== branchId || stock.rem < dto.quantity) throw new ValidationError('Cantidad insuficiente en el remanente');
    await prisma.$transaction([
      prisma.linenStock.update({ where: { linenItemId_floor: { linenItemId: dto.linenItemId, floor: dto.floor } }, data: { rem: { decrement: dto.quantity } } }),
      prisma.linenMovement.create({ data: { branchId, linenItemId: dto.linenItemId, type: 'LAUNDRY', quantity: -dto.quantity, floor: dto.floor, reference: dto.reason || 'Manchada/Deteriorada', createdByUserId: scope.userId } }),
    ]);
    return { ok: true };
  },
};
