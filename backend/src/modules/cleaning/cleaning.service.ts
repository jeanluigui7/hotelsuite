import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { notifyAdmin } from '../../shared/notify';

/** Flujo de limpieza RIZZOS: iniciar limpieza (recoger ropa con estado OK/ROBADA/DETERIORADA)
 *  → habitación EN CURSO → finalizar limpieza → Disponible. */

const CLEANABLE = ['CLEANING', 'LIMPIEZA_EN_ESPERA', 'LIMPIEZA_EN_CURSO', 'LIMPIEZA_SOLICITADA', 'REQUIERE_REPASO'];

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
  tipoFalla: z.string().max(120).optional(),
  acciones: z.array(z.string().max(120)).default([]),
  observaciones: z.string().max(1000).optional().or(z.literal('')),
  photo: z.string().optional(), // data URL (base64) capturada en el navegador
});
export type RevisionDto = z.infer<typeof revisionSchema>;

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
  async finish(scope: RequestScope, roomId: string) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación no encontrada');
    const task = await prisma.housekeepingTask.findFirst({ where: { branchId, roomId, status: 'IN_PROGRESS' } });
    if (task) {
      await prisma.housekeepingTask.update({ where: { id: task.id }, data: { status: 'DONE', result: 'APPROVED', completedAt: new Date() } });
    }
    await prisma.room.update({ where: { id: roomId }, data: { status: 'FREE' } });
    return { ok: true };
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
    const detail = JSON.stringify({ tipoFalla: dto.tipoFalla ?? null, acciones: dto.acciones, observaciones: dto.observaciones || null, photo: dto.photo ?? null });
    // Si había una revisión en curso (PENDING, iniciada con play), se finaliza esa; si no, se crea.
    const pending = await prisma.revision.findFirst({ where: { branchId, roomId: dto.roomId, status: 'PENDING' } });
    const rev = pending
      ? await prisma.revision.update({ where: { id: pending.id }, data: { status: dto.status, notes: detail, createdByUserId: scope.userId } })
      : await prisma.revision.create({ data: { branchId, roomId: dto.roomId, status: dto.status, notes: detail, createdByUserId: scope.userId } });
    // Si la revisión deja la habitación OK y estaba en revisión/mantenimiento, vuelve a disponible.
    if (dto.status === 'OK' && ['REVISION', 'MANTENIMIENTO', 'MAINTENANCE', 'REQUIERE_REPASO', 'LIMPIEZA_EN_CURSO'].includes(room.status)) {
      await prisma.room.update({ where: { id: dto.roomId }, data: { status: 'FREE' } });
    }
    return { id: rev.id };
  },

  /** Historial de revisiones (con detalle parseado). */
  async revisions(scope: RequestScope, roomId?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.revision.findMany({ where: { branchId, ...(roomId ? { roomId } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
    const roomIds = [...new Set(rows.map((r) => r.roomId))];
    const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } });
    const rmap = new Map(rooms.map((r) => [r.id, r.number]));
    return rows.map((r) => {
      let detail: { tipoFalla?: string | null; acciones?: string[]; observaciones?: string | null; photo?: string | null } = {};
      try { detail = r.notes ? JSON.parse(r.notes) : {}; } catch { detail = { observaciones: r.notes }; }
      return { id: r.id, room: rmap.get(r.roomId) ?? '—', status: r.status, createdAt: r.createdAt, ...detail };
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
