import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = { stays: true } satisfies Prisma.MasterFolioInclude;
export type MasterFolioWithStays = Prisma.MasterFolioGetPayload<{ include: typeof include }>;

/** Correlativo del Folio Maestro (FM-00003), atómico y auto-aprovisionado por sucursal. */
async function nextMasterCode(tx: Prisma.TransactionClient, branchId: string): Promise<string> {
  const existing = await tx.folioSeries.findFirst({ where: { branchId, documentType: 'MASTER' }, orderBy: { series: 'asc' } });
  const serie = existing
    ? await tx.folioSeries.update({ where: { id: existing.id }, data: { currentNumber: { increment: 1 } } })
    : await tx.folioSeries.create({ data: { branchId, documentType: 'MASTER', series: 'FM', currentNumber: 1 } });
  return `${serie.series}-${String(serie.currentNumber).padStart(5, '0')}`;
}

export const masterFoliosRepository = {
  list(args: { where: Prisma.MasterFolioWhereInput; skip: number; take: number; orderBy: Prisma.MasterFolioOrderByWithRelationInput }) {
    return prisma.masterFolio.findMany({ ...args, include });
  },
  count(where: Prisma.MasterFolioWhereInput) {
    return prisma.masterFolio.count({ where });
  },
  findById(id: string) {
    return prisma.masterFolio.findUnique({ where: { id }, include });
  },
  create(data: { branchId: string; payerName: string; payerDoc: string | null; payerRuc: string | null; payerAddress: string | null; notes: string | null; createdByUserId: string }) {
    return prisma.$transaction(async (tx) => {
      const code = await nextMasterCode(tx, data.branchId);
      return tx.masterFolio.create({ data: { ...data, code }, include });
    });
  },
  update(id: string, data: Prisma.MasterFolioUpdateInput) {
    return prisma.masterFolio.update({ where: { id }, data, include });
  },
  /** ¿La estancia ya está en algún folio maestro? (una estancia pertenece a lo sumo a uno). */
  findStayLink(stayId: string) {
    return prisma.masterFolioStay.findFirst({ where: { stayId } });
  },
  addStay(masterFolioId: string, stayId: string) {
    return prisma.masterFolioStay.create({ data: { masterFolioId, stayId } });
  },
  removeStay(masterFolioId: string, stayId: string) {
    return prisma.masterFolioStay.deleteMany({ where: { masterFolioId, stayId } });
  },
};
