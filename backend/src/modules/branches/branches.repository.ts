import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const branchesRepository = {
  list(args: {
    where: Prisma.BranchWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.BranchOrderByWithRelationInput;
  }) {
    return prisma.branch.findMany(args);
  },

  count(where: Prisma.BranchWhereInput) {
    return prisma.branch.count({ where });
  },

  findById(id: string) {
    return prisma.branch.findUnique({ where: { id } });
  },

  create(data: Prisma.BranchCreateInput) {
    return prisma.branch.create({ data });
  },

  update(id: string, data: Prisma.BranchUpdateInput) {
    return prisma.branch.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.branch.delete({ where: { id } });
  },
};
