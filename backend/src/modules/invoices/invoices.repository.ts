import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { consumeFolio } from '../folios/folios.repository';

const include = { notes: true } satisfies Prisma.InvoiceInclude;
export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof include }>;

export const invoicesRepository = {
  list(args: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.InvoiceOrderByWithRelationInput;
  }) {
    return prisma.invoice.findMany({ ...args, include });
  },
  count(where: Prisma.InvoiceWhereInput) {
    return prisma.invoice.count({ where });
  },
  findById(id: string) {
    return prisma.invoice.findUnique({ where: { id }, include });
  },

  /** Reserves a folio and creates the invoice atomically. */
  issue(data: {
    branchId: string;
    saleId: string | null;
    type: string;
    customerName: string;
    customerDoc: string | null;
    subtotal: number;
    taxAmount: number;
    total: number;
    createdByUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const folio = await consumeFolio(tx, data.branchId, data.type);
      return tx.invoice.create({
        data: {
          branchId: data.branchId,
          saleId: data.saleId,
          type: data.type,
          series: folio.series,
          number: folio.number,
          customerName: data.customerName,
          customerDoc: data.customerDoc,
          subtotal: data.subtotal,
          taxAmount: data.taxAmount,
          total: data.total,
          status: 'ISSUED',
          providerStatus: 'PENDING',
          createdByUserId: data.createdByUserId,
        },
        include,
      });
    });
  },

  update(id: string, data: Prisma.InvoiceUpdateInput) {
    return prisma.invoice.update({ where: { id }, data, include });
  },
};
