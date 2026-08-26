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

  /** Reserves a folio and creates the invoice (+ its lines) atomically. */
  issue(data: {
    branchId: string;
    saleId: string | null;
    stayId: string | null;
    type: string;
    customerName: string;
    customerDoc: string | null;
    customerAddress: string | null;
    subtotal: number;
    taxAmount: number;
    total: number;
    createdByUserId: string;
    lines: { saleItemId: string | null; concept: string | null; description: string; quantity: number; amount: number }[];
  }) {
    return prisma.$transaction(async (tx) => {
      const folio = await consumeFolio(tx, data.branchId, data.type);
      const invoice = await tx.invoice.create({
        data: {
          branchId: data.branchId,
          saleId: data.saleId,
          stayId: data.stayId,
          type: data.type,
          series: folio.series,
          number: folio.number,
          customerName: data.customerName,
          customerDoc: data.customerDoc,
          customerAddress: data.customerAddress,
          subtotal: data.subtotal,
          taxAmount: data.taxAmount,
          total: data.total,
          status: 'ISSUED',
          providerStatus: 'PENDING',
          createdByUserId: data.createdByUserId,
        },
        include,
      });
      if (data.lines.length > 0) {
        await tx.invoiceLine.createMany({
          data: data.lines.map((l) => ({
            branchId: data.branchId,
            invoiceId: invoice.id,
            saleItemId: l.saleItemId,
            stayId: data.stayId,
            concept: l.concept,
            description: l.description,
            quantity: l.quantity,
            amount: l.amount,
          })),
        });
      }
      return invoice;
    });
  },

  update(id: string, data: Prisma.InvoiceUpdateInput) {
    return prisma.invoice.update({ where: { id }, data, include });
  },
};
