import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const revisionsRepository = {
  list(args: {
    where: Prisma.RevisionWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.RevisionOrderByWithRelationInput;
  }) {
    return prisma.revision.findMany(args);
  },
  count(where: Prisma.RevisionWhereInput) {
    return prisma.revision.count({ where });
  },
  findById(id: string) {
    return prisma.revision.findUnique({ where: { id } });
  },
  create(data: Prisma.RevisionUncheckedCreateInput) {
    return prisma.revision.create({ data });
  },
  update(id: string, data: Prisma.RevisionUncheckedUpdateInput) {
    return prisma.revision.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.revision.delete({ where: { id } });
  },
};
