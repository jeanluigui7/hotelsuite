import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const clientTiersRepository = {
  list(args: {
    where: Prisma.ClientTierWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ClientTierOrderByWithRelationInput;
  }) {
    return prisma.clientTier.findMany(args);
  },

  count(where: Prisma.ClientTierWhereInput) {
    return prisma.clientTier.count({ where });
  },

  findById(id: string) {
    return prisma.clientTier.findUnique({ where: { id } });
  },

  create(data: Prisma.ClientTierUncheckedCreateInput) {
    return prisma.clientTier.create({ data });
  },

  update(id: string, data: Prisma.ClientTierUpdateInput) {
    return prisma.clientTier.update({ where: { id }, data });
  },

  countCustomRates(tierId: string) {
    return prisma.customRate.count({ where: { tierId } });
  },

  delete(id: string) {
    return prisma.clientTier.delete({ where: { id } });
  },
};
