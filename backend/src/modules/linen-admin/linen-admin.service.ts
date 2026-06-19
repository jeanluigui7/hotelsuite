import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/** Lado administrador del inventario de ropa: transferir ropa a un piso (suministrar) y
 *  atender las solicitudes de ropa que envía limpieza (LinenMovement type REQUEST). */

export const transferSchema = z.object({
  linenItemId: z.string().min(1),
  toFloor: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
});
export type TransferDto = z.infer<typeof transferSchema>;

async function supplyToFloor(branchId: string, linenItemId: string, floor: string, quantity: number, userId: string, type: string, reference: string) {
  await prisma.linenStock.upsert({
    where: { linenItemId_floor: { linenItemId, floor } },
    update: { sum: { increment: quantity } },
    create: { branchId, linenItemId, floor, rem: 0, sum: quantity },
  });
  await prisma.linenMovement.create({
    data: { branchId, linenItemId, type, quantity, floor, areaTo: floor, reference, createdByUserId: userId },
  });
}

export const linenAdminService = {
  /** Solicitudes de ropa pendientes (enviadas por limpieza). */
  async requests(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const movs = await prisma.linenMovement.findMany({ where: { branchId, type: 'REQUEST' }, orderBy: { createdAt: 'desc' } });
    const ids = [...new Set(movs.map((m) => m.linenItemId))];
    const items = await prisma.linenItem.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, name: true } });
    const imap = new Map(items.map((i) => [i.id, i]));
    return movs.map((m) => ({
      id: m.id,
      linenItemId: m.linenItemId,
      type: imap.get(m.linenItemId)?.type ?? '',
      name: imap.get(m.linenItemId)?.name ?? '—',
      floor: m.floor,
      quantity: m.quantity,
      createdAt: m.createdAt,
    }));
  },

  /** Atiende (envía) una solicitud: suministra al piso y elimina la solicitud pendiente. */
  async fulfill(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const mov = await prisma.linenMovement.findUnique({ where: { id } });
    if (!mov || mov.branchId !== branchId || mov.type !== 'REQUEST') throw new ValidationError('Solicitud no encontrada');
    await supplyToFloor(branchId, mov.linenItemId, mov.floor ?? 'SIN PISO', mov.quantity, scope.userId, 'SUPPLY', 'Atención de solicitud');
    await prisma.linenMovement.delete({ where: { id } });
    return { ok: true };
  },

  /** Transfiere ropa a un piso (suministrado). */
  async transfer(scope: RequestScope, dto: TransferDto) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id: dto.linenItemId } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    await supplyToFloor(branchId, dto.linenItemId, dto.toFloor, dto.quantity, scope.userId, 'TRANSFER', 'Transferencia de ropa');
    return { ok: true };
  },
};
