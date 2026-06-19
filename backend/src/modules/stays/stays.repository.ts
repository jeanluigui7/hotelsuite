import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const stayInclude = {
  room: { select: { id: true, number: true, floor: true } },
  guest: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
  rate: { select: { id: true, label: true } },
  tier: { select: { id: true, name: true } },
  additionalGuests: { include: { guest: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.StayInclude;

export type StayWithRelations = Prisma.StayGetPayload<{ include: typeof stayInclude }>;

export const staysRepository = {
  list(args: {
    where: Prisma.StayWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.StayOrderByWithRelationInput;
  }) {
    return prisma.stay.findMany({ ...args, include: stayInclude });
  },
  count(where: Prisma.StayWhereInput) {
    return prisma.stay.count({ where });
  },
  findById(id: string) {
    return prisma.stay.findUnique({ where: { id }, include: stayInclude });
  },
  findOpenByRoom(roomId: string) {
    return prisma.stay.findFirst({ where: { roomId, status: 'OPEN' } });
  },

  /** Atomic check-in: create the stay, occupy the room, link additional guests. */
  checkIn(data: {
    branchId: string;
    roomId: string;
    guestId: string;
    rateId: string;
    tierId: string | null;
    durationMinutes: number;
    priceAgreed: number;
    balanceDue: number | null;
    checkInAt: Date;
    plannedCheckoutAt: Date;
    adults: number;
    children: number;
    notes: string | null;
    additionalGuestIds: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const stay = await tx.stay.create({
        data: {
          branchId: data.branchId,
          roomId: data.roomId,
          guestId: data.guestId,
          rateId: data.rateId,
          tierId: data.tierId,
          durationMinutes: data.durationMinutes,
          priceAgreed: data.priceAgreed,
          balanceDue: data.balanceDue,
          checkInAt: data.checkInAt,
          plannedCheckoutAt: data.plannedCheckoutAt,
          adults: data.adults,
          children: data.children,
          notes: data.notes,
        },
      });
      if (data.additionalGuestIds.length > 0) {
        await tx.stayGuest.createMany({
          data: data.additionalGuestIds.map((guestId) => ({ stayId: stay.id, guestId })),
        });
      }
      await tx.room.update({ where: { id: data.roomId }, data: { status: 'OCCUPIED' } });
      return tx.stay.findUnique({ where: { id: stay.id }, include: stayInclude });
    });
  },

  /** Atomic check-out: close the stay and set the room status. */
  checkOut(stayId: string, roomId: string, roomStatus: string) {
    return prisma.$transaction(async (tx) => {
      await tx.stay.update({
        where: { id: stayId },
        data: { status: 'CLOSED', checkOutAt: new Date() },
      });
      await tx.room.update({ where: { id: roomId }, data: { status: roomStatus } });
      return tx.stay.findUnique({ where: { id: stayId }, include: stayInclude });
    });
  },
};
