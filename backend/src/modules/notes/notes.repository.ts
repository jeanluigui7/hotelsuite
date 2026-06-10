import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { consumeFolio } from '../folios/folios.repository';

const include = {
  invoice: { select: { id: true, type: true, series: true, number: true } },
} satisfies Prisma.CreditDebitNoteInclude;

export type NoteWithRelations = Prisma.CreditDebitNoteGetPayload<{ include: typeof include }>;

export const notesRepository = {
  list(args: {
    where: Prisma.CreditDebitNoteWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.CreditDebitNoteOrderByWithRelationInput;
  }) {
    return prisma.creditDebitNote.findMany({ ...args, include });
  },
  count(where: Prisma.CreditDebitNoteWhereInput) {
    return prisma.creditDebitNote.count({ where });
  },
  findById(id: string) {
    return prisma.creditDebitNote.findUnique({ where: { id }, include });
  },

  issue(data: {
    branchId: string;
    invoiceId: string;
    type: string;
    reason: string;
    total: number;
    createdByUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const folio = await consumeFolio(tx, data.branchId, 'NOTE');
      return tx.creditDebitNote.create({
        data: {
          branchId: data.branchId,
          invoiceId: data.invoiceId,
          type: data.type,
          series: folio.series,
          number: folio.number,
          reason: data.reason,
          total: data.total,
          status: 'ISSUED',
          createdByUserId: data.createdByUserId,
        },
        include,
      });
    });
  },
};
