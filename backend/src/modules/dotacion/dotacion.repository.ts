import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const dotacionRepository = {
  list(where: Prisma.RoomTypeDotacionWhereInput) {
    return prisma.roomTypeDotacion.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  },
  findById(id: string) {
    return prisma.roomTypeDotacion.findUnique({ where: { id } });
  },
  create(data: Prisma.RoomTypeDotacionUncheckedCreateInput) {
    return prisma.roomTypeDotacion.create({ data });
  },
  update(id: string, data: Prisma.RoomTypeDotacionUpdateInput) {
    return prisma.roomTypeDotacion.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.roomTypeDotacion.delete({ where: { id } });
  },
};
