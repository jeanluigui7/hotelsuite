import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { recordActivity } from '../activity-log/activity.emitter';

const LINEN_CENTRAL = 'ALMACEN'; // fila floor='ALMACEN' de LinenStock = Almacén General de Ropa

export const createRegularizationSchema = z.object({
  floor: z.string().min(1),
  lines: z.array(z.object({ linenItemId: z.string().min(1), requestedQty: z.coerce.number().int().min(0) })).min(1),
});
export type CreateRegularizationDto = z.infer<typeof createRegularizationSchema>;

/** Turno operativo actual + inicio de su ventana (para la regla "una regularización por piso por turno"). */
function currentShift(now = new Date()): { shift: 'MANANA' | 'TARDE' | 'NOCHE'; windowStart: Date } {
  const h = now.getHours();
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  if (h >= 6 && h < 14) return { shift: 'MANANA', windowStart: at(0, 6) };
  if (h >= 14 && h < 22) return { shift: 'TARDE', windowStart: at(0, 14) };
  // NOCHE: 22:00 → 06:00 del día siguiente.
  return { shift: 'NOCHE', windowStart: h >= 22 ? at(0, 22) : at(-1, 22) };
}

/** ¿El admin puede aprobar/revisar? (super admin o permiso de edición de inventario/config). */
function assertCanReview(scope: RequestScope): void {
  const ok = scope.isSuperAdmin || scope.permissions.includes('inventory:edit') || scope.permissions.includes('settings:edit');
  if (!ok) throw new ForbiddenError('Solo administración puede revisar regularizaciones.');
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  const u = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map(u.map((x) => [x.id, x.name]));
}

export const linenRegularizationService = {
  /** Pisos que YA regularizaron en el turno actual (el front oculta "Regularizar stock" para ellos). */
  async blockedFloors(scope: RequestScope): Promise<string[]> {
    const branchId = requireActiveBranch(scope);
    const { windowStart } = currentShift();
    const open = await prisma.linenRegularization.findMany({
      where: { branchId, createdAt: { gte: windowStart } },
      select: { floor: true },
    });
    return [...new Set(open.map((r) => r.floor))];
  },

  /** Artículos de ropa (LinenItem) activos de la sucursal, para los desplegables por categoría. */
  async items(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.linenItem.findMany({
      where: { branchId, status: 'active' },
      select: { id: true, name: true, type: true, color: true, categoryId: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows;
  },

  /** HOUSEKEEPING: crea una solicitud de regularización del REM de un piso (una por piso+turno). */
  async create(scope: RequestScope, dto: CreateRegularizationDto) {
    const branchId = requireActiveBranch(scope);
    const { shift, windowStart } = currentShift();

    // Regla: una sola solicitud por sucursal+piso durante el turno actual.
    const exists = await prisma.linenRegularization.findFirst({
      where: { branchId, floor: dto.floor, createdAt: { gte: windowStart } },
      select: { id: true },
    });
    if (exists) throw new ConflictError('Ya se envió una regularización para este piso en el turno actual. Se habilita nuevamente al cambiar de turno.');

    // REM del sistema por artículo (0 si no hay fila en el piso).
    const itemIds = [...new Set(dto.lines.map((l) => l.linenItemId))];
    const items = await prisma.linenItem.findMany({ where: { id: { in: itemIds }, branchId }, select: { id: true } });
    if (items.length !== itemIds.length) throw new ValidationError('Algún artículo no pertenece a la sucursal.');
    const stocks = await prisma.linenStock.findMany({ where: { floor: dto.floor, linenItemId: { in: itemIds } }, select: { linenItemId: true, rem: true } });
    const remBy = new Map(stocks.map((s) => [s.linenItemId, s.rem]));

    const lines = dto.lines.map((l) => {
      const systemQty = remBy.get(l.linenItemId) ?? 0;
      return { linenItemId: l.linenItemId, systemQty, requestedQty: l.requestedQty, diff: l.requestedQty - systemQty };
    });
    if (!lines.some((l) => l.diff !== 0)) throw new ValidationError('No hay diferencias que regularizar en este piso.');

    const reg = await prisma.linenRegularization.create({
      data: {
        branchId, floor: dto.floor, shift, shiftWindowStart: windowStart, status: 'PENDING',
        requestedByUserId: scope.userId,
        lines: { create: lines },
      },
    });
    void recordActivity(scope, {
      activity: 'REGULARIZATION_REQUEST', area: 'INVENTARIO', entityId: reg.id, reference: `Ropa · ${dto.floor}`,
      detail: `Regularización solicitada · ${dto.floor} · ${lines.filter((l) => l.diff !== 0).length} diferencia(s)`,
      meta: { floor: dto.floor, shift, diffs: lines.filter((l) => l.diff !== 0).length },
    });
    return { id: reg.id };
  },

  /** ADMIN: lista de solicitudes PENDIENTES de la sucursal, con líneas + disponibilidad del central. */
  async list(scope: RequestScope) {
    assertCanReview(scope);
    const branchId = requireActiveBranch(scope);
    const regs = await prisma.linenRegularization.findMany({
      where: { branchId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { lines: { include: { linenItem: { select: { id: true, name: true, type: true, color: true } } } } },
    });
    const names = await userNames([...new Set(regs.map((r) => r.requestedByUserId))]);
    // Disponibilidad del central por artículo (rem de floor='ALMACEN').
    const allItemIds = [...new Set(regs.flatMap((r) => r.lines.map((l) => l.linenItemId)))];
    const central = allItemIds.length
      ? await prisma.linenStock.findMany({ where: { floor: LINEN_CENTRAL, linenItemId: { in: allItemIds } }, select: { linenItemId: true, rem: true } })
      : [];
    const availBy = new Map(central.map((c) => [c.linenItemId, c.rem]));

    return regs.map((r) => {
      const lines = r.lines.map((l) => ({
        linenItemId: l.linenItemId, name: l.linenItem.name, type: l.linenItem.type, color: l.linenItem.color,
        systemQty: l.systemQty, requestedQty: l.requestedQty, diff: l.diff,
        available: l.diff > 0 ? (availBy.get(l.linenItemId) ?? 0) : null, // solo relevante para positivas
        shortage: l.diff > 0 ? Math.max(0, l.diff - (availBy.get(l.linenItemId) ?? 0)) : 0,
      }));
      return {
        id: r.id, floor: r.floor, shift: r.shift, createdAt: r.createdAt,
        requestedByName: names.get(r.requestedByUserId) ?? null,
        diffCount: lines.filter((l) => l.diff !== 0).length,
        lines,
        canApprove: lines.every((l) => l.shortage === 0),
      };
    });
  },

  /** ADMIN: aprueba (revalida stock del central de forma atómica y aplica los movimientos). */
  async approve(scope: RequestScope, id: string) {
    assertCanReview(scope);
    const branchId = requireActiveBranch(scope);
    const reg = await prisma.linenRegularization.findUnique({ where: { id }, include: { lines: true } });
    if (!reg || reg.branchId !== branchId) throw new NotFoundError('Regularización no encontrada');
    if (reg.status !== 'PENDING') throw new ConflictError('La regularización ya fue resuelta.');

    const result = await prisma.$transaction(async (tx) => {
      // Re-validar el central AHORA (pudo cambiar mientras el admin revisaba): atómico, sin movimientos parciales.
      const positives = reg.lines.filter((l) => l.diff > 0);
      for (const l of positives) {
        const c = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId: l.linenItemId, floor: LINEN_CENTRAL } }, select: { rem: true } });
        if ((c?.rem ?? 0) < l.diff) {
          const it = await tx.linenItem.findUnique({ where: { id: l.linenItemId }, select: { name: true } });
          throw new ConflictError(`Stock insuficiente en Almacén General para "${it?.name ?? 'artículo'}": requiere ${l.diff}, disponible ${c?.rem ?? 0}.`);
        }
      }
      // Aplicar deltas al REM del piso (no toca SUM). Positivas descuentan del central.
      for (const l of reg.lines) {
        if (l.diff === 0) continue;
        // Fila del piso (upsert).
        const floorRow = await tx.linenStock.upsert({
          where: { linenItemId_floor: { linenItemId: l.linenItemId, floor: reg.floor } },
          update: {}, create: { branchId, linenItemId: l.linenItemId, floor: reg.floor, rem: 0, sum: 0 },
          select: { rem: true },
        });
        const newRem = Math.max(0, floorRow.rem + l.diff);
        await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId: l.linenItemId, floor: reg.floor } }, data: { rem: newRem } });
        if (l.diff > 0) {
          // Central: descuenta el excedente que entra al piso.
          await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId: l.linenItemId, floor: LINEN_CENTRAL } }, data: { rem: { decrement: l.diff } } });
          await tx.linenMovement.create({ data: { branchId, linenItemId: l.linenItemId, type: 'TRANSFER', quantity: l.diff, floor: reg.floor, areaFrom: LINEN_CENTRAL, areaTo: reg.floor, reference: 'Regularización (aprobada)', createdByUserId: scope.userId } });
        } else {
          // Negativa: corrección a la baja del REM (merma), sin devolver al central ni tocar SUM.
          await tx.linenMovement.create({ data: { branchId, linenItemId: l.linenItemId, type: 'ADJUST', quantity: l.diff, floor: reg.floor, reference: 'Regularización (merma)', createdByUserId: scope.userId } });
        }
      }
      const updated = await tx.linenRegularization.update({ where: { id }, data: { status: 'APPROVED', reviewedByUserId: scope.userId, reviewedAt: new Date() } });
      return updated;
    });

    void recordActivity(scope, {
      activity: 'REGULARIZATION_APPROVED', area: 'INVENTARIO', entityId: id, reference: `Ropa · ${reg.floor}`,
      detail: `Regularización aprobada · ${reg.floor} · ${reg.lines.filter((l) => l.diff !== 0).length} diferencia(s)`,
      meta: { floor: reg.floor, shift: reg.shift, diffs: reg.lines.filter((l) => l.diff !== 0).map((l) => ({ item: l.linenItemId, diff: l.diff })) },
    });
    return { id: result.id, status: result.status };
  },

  /** ADMIN: rechaza (no toca ningún stock; queda en historial). */
  async reject(scope: RequestScope, id: string, note?: string) {
    assertCanReview(scope);
    const branchId = requireActiveBranch(scope);
    const reg = await prisma.linenRegularization.findUnique({ where: { id }, select: { id: true, branchId: true, status: true, floor: true, shift: true } });
    if (!reg || reg.branchId !== branchId) throw new NotFoundError('Regularización no encontrada');
    if (reg.status !== 'PENDING') throw new ConflictError('La regularización ya fue resuelta.');
    await prisma.linenRegularization.update({ where: { id }, data: { status: 'REJECTED', reviewedByUserId: scope.userId, reviewedAt: new Date(), reviewNote: note?.trim() || null } });
    void recordActivity(scope, {
      activity: 'REGULARIZATION_REJECTED', area: 'INVENTARIO', entityId: id, reference: `Ropa · ${reg.floor}`,
      detail: `Regularización rechazada · ${reg.floor}${note?.trim() ? ` · ${note.trim()}` : ''}`,
      meta: { floor: reg.floor, shift: reg.shift, note: note?.trim() || null },
    });
    return { id, status: 'REJECTED' };
  },

  /** Conteo de PENDIENTES (para el badge del botón). */
  async pendingCount(scope: RequestScope): Promise<number> {
    const branchId = requireActiveBranch(scope);
    return prisma.linenRegularization.count({ where: { branchId, status: 'PENDING' } });
  },
};
