import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const rateInclude = { roomType: { select: { id: true, name: true } } } satisfies Prisma.RateInclude;
const customInclude = {
  roomType: { select: { id: true, name: true } },
  tier: { select: { id: true, name: true } },
} satisfies Prisma.CustomRateInclude;

export const ratesRepository = {
  // ── Base rates ──
  listRates(where: Prisma.RateWhereInput) {
    return prisma.rate.findMany({ where, include: rateInclude, orderBy: { durationMinutes: 'asc' } });
  },
  findRate(id: string) {
    return prisma.rate.findUnique({ where: { id }, include: rateInclude });
  },
  createRate(data: Prisma.RateUncheckedCreateInput) {
    return prisma.rate.create({ data, include: rateInclude });
  },
  updateRate(id: string, data: Prisma.RateUpdateInput) {
    return prisma.rate.update({ where: { id }, data, include: rateInclude });
  },
  deleteRate(id: string) {
    // Desvincula las estancias que la referencian (conservan su precio congelado) y borra.
    return prisma.$transaction(async (tx) => {
      await tx.stay.updateMany({ where: { rateId: id }, data: { rateId: null } });
      return tx.rate.delete({ where: { id } });
    });
  },

  // ── Custom rates ──
  listCustomRates(where: Prisma.CustomRateWhereInput) {
    return prisma.customRate.findMany({
      where,
      include: customInclude,
      orderBy: { durationMinutes: 'asc' },
    });
  },
  findCustomRate(id: string) {
    return prisma.customRate.findUnique({ where: { id }, include: customInclude });
  },
  createCustomRate(data: Prisma.CustomRateUncheckedCreateInput) {
    return prisma.customRate.create({ data, include: customInclude });
  },
  updateCustomRate(id: string, data: Prisma.CustomRateUpdateInput) {
    return prisma.customRate.update({ where: { id }, data, include: customInclude });
  },
  deleteCustomRate(id: string) {
    return prisma.customRate.delete({ where: { id } });
  },
};
