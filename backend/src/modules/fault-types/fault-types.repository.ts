import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const faultTypesRepository = {
  list(args: {
    where: Prisma.FaultTypeWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.FaultTypeOrderByWithRelationInput[];
  }) {
    return prisma.faultType.findMany(args);
  },

  count(where: Prisma.FaultTypeWhereInput) {
    return prisma.faultType.count({ where });
  },

  /** Todas las fallas (para el árbol agrupado); opcionalmente solo activas. */
  all(onlyActive: boolean) {
    return prisma.faultType.findMany({
      where: onlyActive ? { status: 'active' } : {},
      orderBy: [{ categoryLabel: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  },

  findById(id: string) {
    return prisma.faultType.findUnique({ where: { id } });
  },

  findFirst(where: Prisma.FaultTypeWhereInput) {
    return prisma.faultType.findFirst({ where });
  },

  create(data: Prisma.FaultTypeUncheckedCreateInput) {
    return prisma.faultType.create({ data });
  },

  update(id: string, data: Prisma.FaultTypeUpdateInput) {
    return prisma.faultType.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.faultType.delete({ where: { id } });
  },
};
