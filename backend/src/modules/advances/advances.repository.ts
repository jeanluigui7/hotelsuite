import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const advancesRepository = {
  list(branchId: string) {
    return prisma.advance.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' } });
  },
  findById(id: string) {
    return prisma.advance.findUnique({ where: { id } });
  },
  create(data: Prisma.AdvanceUncheckedCreateInput) {
    return prisma.advance.create({ data });
  },
  async maxCodeNumber(branchId: string): Promise<number> {
    const rows = await prisma.advance.findMany({ where: { branchId, code: { not: null } }, select: { code: true } });
    let max = 0;
    for (const r of rows) {
      const n = parseInt((r.code ?? '').replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max;
  },
  async applyAmount(id: string, amount: number) {
    const adv = await prisma.advance.findUnique({ where: { id }, select: { amount: true, applied: true } });
    const applied = Number(adv?.applied ?? 0) + amount;
    const available = Number(adv?.amount ?? 0) - applied;
    const status = available <= 0.009 ? 'APLICADO' : applied > 0 ? 'PARCIAL' : 'POR_APLICAR';
    return prisma.advance.update({ where: { id }, data: { applied, status } });
  },
};
