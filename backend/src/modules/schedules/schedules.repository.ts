import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const schedulesRepository = {
  list(args: {
    where: Prisma.ScheduleWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ScheduleOrderByWithRelationInput;
  }) {
    return prisma.schedule.findMany(args);
  },
  count(where: Prisma.ScheduleWhereInput) {
    return prisma.schedule.count({ where });
  },
  findById(id: string) {
    return prisma.schedule.findUnique({ where: { id } });
  },
  create(data: Prisma.ScheduleUncheckedCreateInput) {
    return prisma.schedule.create({ data });
  },
  update(id: string, data: Prisma.ScheduleUpdateInput) {
    return prisma.schedule.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.schedule.delete({ where: { id } });
  },
};
