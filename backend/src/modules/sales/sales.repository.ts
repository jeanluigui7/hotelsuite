import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = {
  items: true,
  payments: true,
} satisfies Prisma.SaleInclude;

export type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof include }>;

export interface SaleLineInput {
  productId: string | null;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SalePaymentInput {
  method: string;
  amount: number;
  reference: string | null;
}

export const salesRepository = {
  list(args: {
    where: Prisma.SaleWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.SaleOrderByWithRelationInput;
  }) {
    return prisma.sale.findMany({ ...args, include });
  },
  count(where: Prisma.SaleWhereInput) {
    return prisma.sale.count({ where });
  },
  findById(id: string) {
    return prisma.sale.findUnique({ where: { id }, include });
  },

  /** Creates a sale, its items and payments, and decrements stock atomically. */
  create(data: {
    branchId: string;
    stayId: string | null;
    guestId: string | null;
    customerName: string | null;
    cashSessionId: string;
    total: number;
    status: string;
    createdByUserId: string;
    items: SaleLineInput[];
    payments: SalePaymentInput[];
    stockDecrements: { productId: string; warehouseId: string; quantity: number }[];
  }) {
    return prisma.$transaction(async (tx) => {
      // Guarded stock decrements (fail if insufficient).
      for (const dec of data.stockDecrements) {
        const stock = await tx.stock.findUnique({
          where: { productId_warehouseId: { productId: dec.productId, warehouseId: dec.warehouseId } },
        });
        if (!stock || stock.quantity < dec.quantity) {
          throw new Error(`STOCK_INSUFFICIENT:${dec.productId}`);
        }
        await tx.stock.update({
          where: { productId_warehouseId: { productId: dec.productId, warehouseId: dec.warehouseId } },
          data: { quantity: { decrement: dec.quantity } },
        });
      }

      const sale = await tx.sale.create({
        data: {
          branchId: data.branchId,
          stayId: data.stayId,
          guestId: data.guestId,
          customerName: data.customerName,
          cashSessionId: data.cashSessionId,
          total: data.total,
          status: data.status,
          createdByUserId: data.createdByUserId,
          items: { create: data.items },
          payments: {
            create: data.payments.map((p) => ({
              branchId: data.branchId,
              cashSessionId: data.cashSessionId,
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              createdByUserId: data.createdByUserId,
            })),
          },
        },
        include,
      });
      return sale;
    });
  },

  cancel(id: string) {
    return prisma.sale.update({ where: { id }, data: { status: 'CANCELLED' }, include });
  },
};
