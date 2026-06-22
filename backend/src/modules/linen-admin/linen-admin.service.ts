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

/** Almacén central de ropa (origen de los suministros del administrador). */
export const LINEN_CENTRAL = 'ALMACEN';

/**
 * Suministra ropa del almacén central a un piso: valida y descuenta el remanente del
 * almacén central, e incrementa el remanente (rem) y el acumulado suministrado (sum)
 * del piso destino. Registra los dos movimientos (salida del central + entrada al piso).
 */
async function supplyToFloor(branchId: string, linenItemId: string, floor: string, quantity: number, userId: string, type: string, reference: string) {
  if (floor === LINEN_CENTRAL) throw new ValidationError('El destino no puede ser el almacén central');
  await prisma.$transaction(async (tx) => {
    const central = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId, floor: LINEN_CENTRAL } } });
    if (!central || central.rem < quantity) {
      throw new ValidationError(`Stock insuficiente en el almacén central de ropa (disponible ${central?.rem ?? 0}, solicitado ${quantity}).`);
    }
    await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId, floor: LINEN_CENTRAL } }, data: { rem: { decrement: quantity } } });
    await tx.linenStock.upsert({
      where: { linenItemId_floor: { linenItemId, floor } },
      update: { rem: { increment: quantity }, sum: { increment: quantity } },
      create: { branchId, linenItemId, floor, rem: quantity, sum: quantity },
    });
    await tx.linenMovement.create({
      data: { branchId, linenItemId, type: 'OUT', quantity: -quantity, floor: LINEN_CENTRAL, areaFrom: 'Almacén de Ropa', areaTo: floor, reference, createdByUserId: userId },
    });
    await tx.linenMovement.create({
      data: { branchId, linenItemId, type, quantity, floor, areaFrom: 'Almacén de Ropa', areaTo: floor, reference, createdByUserId: userId },
    });
  });
}

/** Repone el almacén central de ropa (compra/ingreso del administrador). */
export const replenishSchema = z.object({
  linenItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
});
export type ReplenishDto = z.infer<typeof replenishSchema>;

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

  /** Stock disponible en el almacén central de ropa (por ítem). */
  async central(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [items, stocks] = await Promise.all([
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.linenStock.findMany({ where: { branchId, floor: LINEN_CENTRAL } }),
    ]);
    const smap = new Map(stocks.map((s) => [s.linenItemId, s.rem]));
    return items.map((it) => ({ linenItemId: it.id, type: it.type, name: it.name, rem: smap.get(it.id) ?? 0 }));
  },

  /** Repone el almacén central de ropa (ingreso/compra del administrador). */
  async replenish(scope: RequestScope, dto: ReplenishDto) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id: dto.linenItemId } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    await prisma.$transaction(async (tx) => {
      await tx.linenStock.upsert({
        where: { linenItemId_floor: { linenItemId: dto.linenItemId, floor: LINEN_CENTRAL } },
        update: { rem: { increment: dto.quantity }, sum: { increment: dto.quantity } },
        create: { branchId, linenItemId: dto.linenItemId, floor: LINEN_CENTRAL, rem: dto.quantity, sum: dto.quantity },
      });
      await tx.linenMovement.create({
        data: { branchId, linenItemId: dto.linenItemId, type: 'IN', quantity: dto.quantity, floor: LINEN_CENTRAL, areaTo: 'Almacén de Ropa', reference: 'Ingreso/compra de ropa', createdByUserId: scope.userId },
      });
    });
    return { ok: true };
  },
};
