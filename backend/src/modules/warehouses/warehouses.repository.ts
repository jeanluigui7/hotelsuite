import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const warehousesRepository = {
  list(args: {
    where: Prisma.WarehouseWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.WarehouseOrderByWithRelationInput;
  }) {
    return prisma.warehouse.findMany(args);
  },
  count(where: Prisma.WarehouseWhereInput) {
    return prisma.warehouse.count({ where });
  },
  findById(id: string) {
    return prisma.warehouse.findUnique({ where: { id } });
  },
  create(data: Prisma.WarehouseUncheckedCreateInput) {
    return prisma.warehouse.create({ data });
  },
  update(id: string, data: Prisma.WarehouseUpdateInput) {
    return prisma.warehouse.update({ where: { id }, data });
  },
  countStock(warehouseId: string) {
    return prisma.stock.count({ where: { warehouseId } });
  },
  delete(id: string) {
    return prisma.warehouse.delete({ where: { id } });
  },
};
