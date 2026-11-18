import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const proformasRepository = {
  list(branchId: string) {
    return prisma.proforma.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' } });
  },
  findById(id: string) {
    return prisma.proforma.findUnique({ where: { id } });
  },
  create(data: Prisma.ProformaUncheckedCreateInput) {
    return prisma.proforma.create({ data });
  },
  update(id: string, data: Prisma.ProformaUncheckedUpdateInput) {
    return prisma.proforma.update({ where: { id }, data });
  },
  async maxCodeNumber(branchId: string): Promise<number> {
    const rows = await prisma.proforma.findMany({ where: { branchId, code: { not: null } }, select: { code: true } });
    let max = 0;
    for (const r of rows) {
      const n = parseInt((r.code ?? '').replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max;
  },
  /** Vence las proformas VIGENTE cuya validez ya pasó. */
  expirePast(branchId: string) {
    return prisma.proforma.updateMany({ where: { branchId, status: 'VIGENTE', validUntil: { not: null, lt: new Date() } }, data: { status: 'VENCIDA' } });
  },
};
