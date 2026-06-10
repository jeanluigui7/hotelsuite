import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export interface MovementData {
  branchId: string;
  productId: string;
  warehouseId: string;
  type: string;
  quantity: number; // signed
  unitCost?: number | null;
  reference?: string | null;
  relatedWarehouseId?: string | null;
  createdByUserId?: string | null;
}

/** Applies a signed delta to a product's stock in a warehouse. Throws if it would go negative. */
export async function applyStockTx(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  delta: number,
): Promise<number> {
  const stock = await tx.stock.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  const current = stock?.quantity ?? 0;
  const next = current + delta;
  if (next < 0) throw new Error('STOCK_INSUFFICIENT');
  await tx.stock.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    update: { quantity: next },
    create: { productId, warehouseId, quantity: next },
  });
  return next;
}

export function createMovementTx(tx: Prisma.TransactionClient, data: MovementData) {
  return tx.inventoryMovement.create({ data });
}

export const movementsRepository = {
  list(args: {
    where: Prisma.InventoryMovementWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.InventoryMovementOrderByWithRelationInput;
  }) {
    return prisma.inventoryMovement.findMany(args);
  },
  count(where: Prisma.InventoryMovementWhereInput) {
    return prisma.inventoryMovement.count({ where });
  },

  adjust(data: MovementData) {
    return prisma.$transaction(async (tx) => {
      await applyStockTx(tx, data.productId, data.warehouseId, data.quantity);
      return createMovementTx(tx, data);
    });
  },

  transfer(args: {
    branchId: string;
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    unitCost: number | null;
    reference: string | null;
    createdByUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await applyStockTx(tx, args.productId, args.fromWarehouseId, -args.quantity);
      await applyStockTx(tx, args.productId, args.toWarehouseId, args.quantity);
      await createMovementTx(tx, {
        branchId: args.branchId,
        productId: args.productId,
        warehouseId: args.fromWarehouseId,
        type: 'TRANSFER',
        quantity: -args.quantity,
        unitCost: args.unitCost,
        reference: args.reference,
        relatedWarehouseId: args.toWarehouseId,
        createdByUserId: args.createdByUserId,
      });
      return createMovementTx(tx, {
        branchId: args.branchId,
        productId: args.productId,
        warehouseId: args.toWarehouseId,
        type: 'TRANSFER',
        quantity: args.quantity,
        unitCost: args.unitCost,
        reference: args.reference,
        relatedWarehouseId: args.fromWarehouseId,
        createdByUserId: args.createdByUserId,
      });
    });
  },
};
