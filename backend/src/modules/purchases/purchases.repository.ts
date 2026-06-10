import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';

const include = {
  supplier: { select: { id: true, name: true } },
  items: true,
} satisfies Prisma.PurchaseInvoiceInclude;

export type PurchaseWithRelations = Prisma.PurchaseInvoiceGetPayload<{ include: typeof include }>;

export const purchasesRepository = {
  list(args: {
    where: Prisma.PurchaseInvoiceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.PurchaseInvoiceOrderByWithRelationInput;
  }) {
    return prisma.purchaseInvoice.findMany({ ...args, include });
  },
  count(where: Prisma.PurchaseInvoiceWhereInput) {
    return prisma.purchaseInvoice.count({ where });
  },
  findById(id: string) {
    return prisma.purchaseInvoice.findUnique({ where: { id }, include });
  },

  /**
   * Receives a purchase: creates the invoice + items, adds stock with PURCHASE
   * movements and updates each product's cost (last cost), all atomically.
   */
  create(data: {
    branchId: string;
    supplierId: string;
    warehouseId: string;
    documentNumber: string | null;
    notes: string | null;
    total: number;
    createdByUserId: string;
    items: { productId: string; quantity: number; unitCost: number; subtotal: number }[];
  }) {
    return prisma.$transaction(async (tx) => {
      const purchase = await tx.purchaseInvoice.create({
        data: {
          branchId: data.branchId,
          supplierId: data.supplierId,
          warehouseId: data.warehouseId,
          documentNumber: data.documentNumber,
          notes: data.notes,
          total: data.total,
          status: 'RECEIVED',
          createdByUserId: data.createdByUserId,
          items: { create: data.items },
        },
        include,
      });

      for (const item of data.items) {
        await applyStockTx(tx, item.productId, data.warehouseId, item.quantity);
        await createMovementTx(tx, {
          branchId: data.branchId,
          productId: item.productId,
          warehouseId: data.warehouseId,
          type: 'PURCHASE',
          quantity: item.quantity,
          unitCost: item.unitCost,
          reference: data.documentNumber ? `Factura ${data.documentNumber}` : 'Ingreso con factura',
          createdByUserId: data.createdByUserId,
        });
        // Last-cost costing: update the product cost to the latest purchase cost.
        await tx.product.update({ where: { id: item.productId }, data: { cost: item.unitCost } });
      }

      return purchase;
    });
  },
};
