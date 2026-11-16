import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

/** Estados de un mantenimiento que cuentan como "abierto" para el bloqueo. */
export const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'];

/**
 * Recalcula el bloqueo por falla de una habitación: `blocked` = hay ≥1 mantenimiento
 * CRÍTICO abierto. Mantiene el estado operativo coherente (LIBRE con crítica → MANTENIMIENTO;
 * al desbloquear vuelve a limpieza u ocupada). Devuelve el estado `blocked` resultante.
 */
export async function recomputeRoomBlock(roomId: string): Promise<boolean> {
  const openCrit = await prisma.maintenance.count({
    where: { roomId, severity: 'CRITICA', status: { in: OPEN_STATUSES } },
  });
  const blocked = openCrit > 0;
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { status: true, blocked: true } });
  if (!room) return blocked;
  const data: Prisma.RoomUncheckedUpdateInput = {};
  if (room.blocked !== blocked) data.blocked = blocked;
  if (blocked && room.status === 'FREE') data.status = 'MAINTENANCE';
  if (!blocked && room.status === 'MAINTENANCE') {
    const hasStay = await prisma.stay.count({ where: { roomId, status: 'OPEN' } });
    data.status = hasStay ? 'OCCUPIED' : 'CLEANING';
  }
  if (Object.keys(data).length) await prisma.room.update({ where: { id: roomId }, data });
  return blocked;
}

/** Resuelve una falla contra el catálogo (la gravedad del catálogo manda). */
export async function resolveFaultSnapshot(input: {
  faultTypeId?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  faultLabel?: string | null;
  severity?: string;
}): Promise<{ faultTypeId: string | null; category: string | null; categoryLabel: string | null; faultLabel: string | null; severity: string }> {
  if (input.faultTypeId) {
    const ft = await prisma.faultType.findUnique({ where: { id: input.faultTypeId } });
    if (ft) {
      return { faultTypeId: ft.id, category: ft.category, categoryLabel: ft.categoryLabel, faultLabel: ft.label, severity: ft.severity };
    }
  }
  return {
    faultTypeId: input.faultTypeId ?? null,
    category: input.category ?? null,
    categoryLabel: input.categoryLabel ?? null,
    faultLabel: input.faultLabel ?? null,
    severity: input.severity ?? 'LEVE',
  };
}
