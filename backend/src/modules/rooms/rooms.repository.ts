import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const listInclude = { roomType: { select: { id: true, name: true } } } satisfies Prisma.RoomInclude;

const mapInclude = {
  roomType: { select: { id: true, name: true } },
  stays: {
    where: { status: 'OPEN' },
    take: 1,
    orderBy: { checkInAt: 'desc' },
    include: {
      guest: { select: { id: true, firstName: true, lastName: true, documentNumber: true, phone: true } },
      _count: { select: { additionalGuests: true } },
    },
  },
} satisfies Prisma.RoomInclude;

export type RoomForMap = Prisma.RoomGetPayload<{ include: typeof mapInclude }>;

export const roomsRepository = {
  list(args: {
    where: Prisma.RoomWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.RoomOrderByWithRelationInput[];
  }) {
    return prisma.room.findMany({ ...args, include: listInclude });
  },
  count(where: Prisma.RoomWhereInput) {
    return prisma.room.count({ where });
  },
  map(branchId: string) {
    return prisma.room.findMany({
      where: { branchId },
      include: mapInclude,
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
  },
  findById(id: string) {
    return prisma.room.findUnique({ where: { id }, include: listInclude });
  },
  create(data: Prisma.RoomUncheckedCreateInput) {
    return prisma.room.create({ data, include: listInclude });
  },
  update(id: string, data: Prisma.RoomUpdateInput) {
    return prisma.room.update({ where: { id }, data, include: listInclude });
  },
  updateStatus(id: string, status: string) {
    return prisma.room.update({ where: { id }, data: { status }, include: listInclude });
  },
  countStays(roomId: string) {
    return prisma.stay.count({ where: { roomId } });
  },
  delete(id: string) {
    return prisma.room.delete({ where: { id } });
  },
};
