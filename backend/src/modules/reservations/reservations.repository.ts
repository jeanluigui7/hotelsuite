import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = {
  roomType: { select: { id: true, name: true } },
  room: { select: { id: true, number: true } },
  guest: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ReservationInclude;

export type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof include }>;

export const reservationsRepository = {
  list(args: {
    where: Prisma.ReservationWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ReservationOrderByWithRelationInput;
  }) {
    return prisma.reservation.findMany({ ...args, include });
  },
  count(where: Prisma.ReservationWhereInput) {
    return prisma.reservation.count({ where });
  },
  findById(id: string) {
    return prisma.reservation.findUnique({ where: { id }, include });
  },
  create(data: Prisma.ReservationUncheckedCreateInput) {
    return prisma.reservation.create({ data, include });
  },
  update(id: string, data: Prisma.ReservationUncheckedUpdateInput) {
    return prisma.reservation.update({ where: { id }, data, include });
  },
  delete(id: string) {
    return prisma.reservation.delete({ where: { id } });
  },
};
