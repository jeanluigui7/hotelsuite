import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const itemsRepository = {
  list(args: {
    where: Prisma.ItemWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ItemOrderByWithRelationInput;
  }) {
    return prisma.item.findMany(args);
  },
  count(where: Prisma.ItemWhereInput) {
    return prisma.item.count({ where });
  },
  findById(id: string) {
    return prisma.item.findUnique({ where: { id } });
  },
  create(data: Prisma.ItemUncheckedCreateInput) {
    return prisma.item.create({ data });
  },
  update(id: string, data: Prisma.ItemUpdateInput) {
    return prisma.item.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.item.delete({ where: { id } });
  },
};
