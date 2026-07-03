import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';

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
  unitCost: number | null;
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
    cashSessionId: string | null;
    total: number;
    status: string;
    createdByUserId: string;
    items: SaleLineInput[];
    payments: SalePaymentInput[];
    stockDecrements: { productId: string; warehouseId: string; quantity: number; unitCost: number | null }[];
  }) {
    return prisma.$transaction(async (tx) => {
      // Guarded stock decrements + Kardex SALE movements (fail if insufficient).
      for (const dec of data.stockDecrements) {
        await applyStockTx(tx, dec.productId, dec.warehouseId, -dec.quantity);
        await createMovementTx(tx, {
          branchId: data.branchId,
          productId: dec.productId,
          warehouseId: dec.warehouseId,
          type: 'SALE',
          quantity: -dec.quantity,
          unitCost: dec.unitCost,
          reference: 'Venta',
          createdByUserId: data.createdByUserId,
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

  /** Corrige el método de pago de todos los pagos de una venta. */
  async setPaymentsMethod(id: string, method: string) {
    await prisma.payment.updateMany({ where: { saleId: id }, data: { method } });
    return prisma.sale.findUnique({ where: { id }, include });
  },
};
