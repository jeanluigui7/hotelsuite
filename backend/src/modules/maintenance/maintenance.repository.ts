import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const maintenanceRepository = {
  list(args: {
    where: Prisma.MaintenanceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.MaintenanceOrderByWithRelationInput;
  }) {
    return prisma.maintenance.findMany(args);
  },
  count(where: Prisma.MaintenanceWhereInput) {
    return prisma.maintenance.count({ where });
  },
  findById(id: string) {
    return prisma.maintenance.findUnique({ where: { id } });
  },
  create(data: Prisma.MaintenanceUncheckedCreateInput) {
    return prisma.maintenance.create({ data });
  },
  update(id: string, data: Prisma.MaintenanceUncheckedUpdateInput) {
    return prisma.maintenance.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.maintenance.delete({ where: { id } });
  },
};
