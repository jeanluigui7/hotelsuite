import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const areasRepository = {
  list(args: {
    where: Prisma.AreaWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.AreaOrderByWithRelationInput;
  }) {
    return prisma.area.findMany(args);
  },
  count(where: Prisma.AreaWhereInput) {
    return prisma.area.count({ where });
  },
  findById(id: string) {
    return prisma.area.findUnique({ where: { id } });
  },
  create(data: Prisma.AreaUncheckedCreateInput) {
    return prisma.area.create({ data });
  },
  update(id: string, data: Prisma.AreaUpdateInput) {
    return prisma.area.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.area.delete({ where: { id } });
  },
};
