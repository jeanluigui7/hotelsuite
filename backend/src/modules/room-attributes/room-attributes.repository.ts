import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const roomAttributesRepository = {
  list(args: {
    where: Prisma.RoomAttributeWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.RoomAttributeOrderByWithRelationInput;
  }) {
    return prisma.roomAttribute.findMany(args);
  },

  count(where: Prisma.RoomAttributeWhereInput) {
    return prisma.roomAttribute.count({ where });
  },

  findById(id: string) {
    return prisma.roomAttribute.findUnique({ where: { id } });
  },

  create(data: Prisma.RoomAttributeUncheckedCreateInput) {
    return prisma.roomAttribute.create({ data });
  },

  update(id: string, data: Prisma.RoomAttributeUpdateInput) {
    return prisma.roomAttribute.update({ where: { id }, data });
  },

  async delete(id: string) {
    // Break the (NoAction) join rows first, then delete the attribute.
    await prisma.roomTypeAttribute.deleteMany({ where: { attributeId: id } });
    return prisma.roomAttribute.delete({ where: { id } });
  },
};
