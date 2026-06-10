import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const foliosRepository = {
  list(args: {
    where: Prisma.FolioSeriesWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.FolioSeriesOrderByWithRelationInput;
  }) {
    return prisma.folioSeries.findMany(args);
  },
  count(where: Prisma.FolioSeriesWhereInput) {
    return prisma.folioSeries.count({ where });
  },
  findById(id: string) {
    return prisma.folioSeries.findUnique({ where: { id } });
  },
  create(data: Prisma.FolioSeriesUncheckedCreateInput) {
    return prisma.folioSeries.create({ data });
  },
  update(id: string, data: Prisma.FolioSeriesUpdateInput) {
    return prisma.folioSeries.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.folioSeries.delete({ where: { id } });
  },
};

/**
 * Reserves the next correlative for a document type within a transaction.
 * Picks the first active series for the type and increments it atomically.
 */
export async function consumeFolio(
  tx: Prisma.TransactionClient,
  branchId: string,
  documentType: string,
): Promise<{ series: string; number: number }> {
  const serie = await tx.folioSeries.findFirst({
    where: { branchId, documentType, status: 'active' },
    orderBy: { series: 'asc' },
  });
  if (!serie) {
    throw new Error(`NO_FOLIO_SERIES:${documentType}`);
  }
  const updated = await tx.folioSeries.update({
    where: { id: serie.id },
    data: { currentNumber: { increment: 1 } },
  });
  return { series: updated.series, number: updated.currentNumber };
}
