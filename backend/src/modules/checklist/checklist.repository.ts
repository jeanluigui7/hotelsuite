import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const checklistRepository = {
  list(args: {
    where: Prisma.ChecklistItemWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ChecklistItemOrderByWithRelationInput;
  }) {
    return prisma.checklistItem.findMany(args);
  },
  count(where: Prisma.ChecklistItemWhereInput) {
    return prisma.checklistItem.count({ where });
  },
  findById(id: string) {
    return prisma.checklistItem.findUnique({ where: { id } });
  },
  create(data: Prisma.ChecklistItemUncheckedCreateInput) {
    return prisma.checklistItem.create({ data });
  },
  update(id: string, data: Prisma.ChecklistItemUpdateInput) {
    return prisma.checklistItem.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.checklistItem.delete({ where: { id } });
  },
};
