import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const laundryTasksRepository = {
  list(args: {
    where: Prisma.LaundryTaskWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.LaundryTaskOrderByWithRelationInput;
  }) {
    return prisma.laundryTask.findMany(args);
  },
  count(where: Prisma.LaundryTaskWhereInput) {
    return prisma.laundryTask.count({ where });
  },
  findById(id: string) {
    return prisma.laundryTask.findUnique({ where: { id } });
  },
  create(data: Prisma.LaundryTaskUncheckedCreateInput) {
    return prisma.laundryTask.create({ data });
  },
  update(id: string, data: Prisma.LaundryTaskUncheckedUpdateInput) {
    return prisma.laundryTask.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.laundryTask.delete({ where: { id } });
  },
};
