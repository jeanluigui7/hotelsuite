import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const inventoryCategoriesRepository = {
  list(args: {
    where: Prisma.InventoryCategoryWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.InventoryCategoryOrderByWithRelationInput;
  }) {
    return prisma.inventoryCategory.findMany(args);
  },
  count(where: Prisma.InventoryCategoryWhereInput) {
    return prisma.inventoryCategory.count({ where });
  },
  findById(id: string) {
    return prisma.inventoryCategory.findUnique({ where: { id } });
  },
  create(data: Prisma.InventoryCategoryUncheckedCreateInput) {
    return prisma.inventoryCategory.create({ data });
  },
  update(id: string, data: Prisma.InventoryCategoryUpdateInput) {
    return prisma.inventoryCategory.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.inventoryCategory.delete({ where: { id } });
  },
};
