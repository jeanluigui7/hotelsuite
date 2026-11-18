import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const fullInclude = {
  rooms: {
    orderBy: { sortOrder: 'asc' as const },
    include: { attributes: true, guests: true },
  },
  payments: { orderBy: { paidAt: 'asc' as const } },
  scheduledPayments: true,
  documents: { orderBy: { issuedAt: 'asc' as const } },
} satisfies Prisma.ReservationInclude;

const listInclude = {
  rooms: { orderBy: { sortOrder: 'asc' as const }, select: { roomId: true, roomNumber: true, roomTypeName: true, unitStatus: true } },
} satisfies Prisma.ReservationInclude;

export type ReservationFull = Prisma.ReservationGetPayload<{ include: typeof fullInclude }>;
export type ReservationListRow = Prisma.ReservationGetPayload<{ include: typeof listInclude }>;

/** Datos ya preparados por el service para persistir una reserva rica. */
export interface RichReservationInput {
  reservation: Prisma.ReservationUncheckedCreateInput;
  rooms: {
    room: Omit<Prisma.ReservationRoomUncheckedCreateInput, 'reservationId'>;
    attributes: Omit<Prisma.ReservationRoomAttributeUncheckedCreateInput, 'reservationRoomId'>[];
    guests: Omit<Prisma.ReservationGuestUncheckedCreateInput, 'reservationRoomId'>[];
  }[];
  payments: Omit<Prisma.ReservationPaymentUncheckedCreateInput, 'reservationId'>[];
  scheduled: Omit<Prisma.ReservationScheduledPaymentUncheckedCreateInput, 'reservationId'>[];
}

type Tx = Prisma.TransactionClient;

async function deleteChildren(tx: Tx, reservationId: string): Promise<void> {
  const rooms = await tx.reservationRoom.findMany({ where: { reservationId }, select: { id: true } });
  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length) {
    await tx.reservationRoomAttribute.deleteMany({ where: { reservationRoomId: { in: roomIds } } });
    await tx.reservationGuest.deleteMany({ where: { reservationRoomId: { in: roomIds } } });
    await tx.reservationRoom.deleteMany({ where: { reservationId } });
  }
  await tx.reservationPayment.deleteMany({ where: { reservationId } });
  await tx.reservationScheduledPayment.deleteMany({ where: { reservationId } });
}

async function writeChildren(tx: Tx, reservationId: string, input: RichReservationInput): Promise<void> {
  for (const r of input.rooms) {
    const rr = await tx.reservationRoom.create({ data: { ...r.room, reservationId } });
    if (r.attributes.length) await tx.reservationRoomAttribute.createMany({ data: r.attributes.map((a) => ({ ...a, reservationRoomId: rr.id })) });
    if (r.guests.length) await tx.reservationGuest.createMany({ data: r.guests.map((g) => ({ ...g, reservationRoomId: rr.id })) });
  }
  if (input.payments.length) await tx.reservationPayment.createMany({ data: input.payments.map((p) => ({ ...p, reservationId })) });
  if (input.scheduled.length) await tx.reservationScheduledPayment.createMany({ data: input.scheduled.map((s) => ({ ...s, reservationId })) });
}

export const reservationsRepository = {
  list(args: { where: Prisma.ReservationWhereInput; skip: number; take: number; orderBy: Prisma.ReservationOrderByWithRelationInput }) {
    return prisma.reservation.findMany({ ...args, include: listInclude });
  },
  count(where: Prisma.ReservationWhereInput) {
    return prisma.reservation.count({ where });
  },
  findById(id: string) {
    return prisma.reservation.findUnique({ where: { id }, include: fullInclude });
  },
  /** Mayor número de código R-#### usado en la sucursal (para el correlativo). */
  async maxCodeNumber(branchId: string): Promise<number> {
    const rows = await prisma.reservation.findMany({ where: { branchId, code: { not: null } }, select: { code: true } });
    let max = 0;
    for (const r of rows) {
      const n = parseInt((r.code ?? '').replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max;
  },

  async createFull(input: RichReservationInput): Promise<ReservationFull> {
    const id = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.create({ data: input.reservation });
      await writeChildren(tx, r.id, input);
      return r.id;
    });
    return (await this.findById(id))!;
  },

  async updateFull(id: string, reservationData: Prisma.ReservationUncheckedUpdateInput, input: RichReservationInput): Promise<ReservationFull> {
    await prisma.$transaction(async (tx) => {
      await deleteChildren(tx, id);
      await tx.reservation.update({ where: { id }, data: reservationData });
      await writeChildren(tx, id, input);
    });
    return (await this.findById(id))!;
  },

  /** Actualiza solo campos de cabecera (confirmar / cancelar / no-show). */
  async patchHeader(id: string, data: Prisma.ReservationUncheckedUpdateInput): Promise<ReservationFull> {
    await prisma.reservation.update({ where: { id }, data });
    return (await this.findById(id))!;
  },

  /** Agrega un pago y recalcula pagado/saldo/estado de la reserva (transaccional). */
  async addPayment(reservationId: string, payment: Omit<Prisma.ReservationPaymentUncheckedCreateInput, 'reservationId'>): Promise<ReservationFull> {
    await prisma.$transaction(async (tx) => {
      await tx.reservationPayment.create({ data: { ...payment, reservationId } });
      const agg = await tx.reservationPayment.aggregate({ where: { reservationId }, _sum: { amount: true } });
      const paid = Number(agg._sum.amount ?? 0);
      const r = await tx.reservation.findUnique({ where: { id: reservationId }, select: { total: true } });
      const total = Number(r?.total ?? 0);
      const paymentStatus = paid <= 0 ? 'SIN_PAGO' : total > 0 && paid >= total ? 'PAGADO' : 'PARCIAL';
      await tx.reservation.update({ where: { id: reservationId }, data: { paid, balance: total - paid, paymentStatus } });
    });
    return (await this.findById(reservationId))!;
  },

  /** Emite un documento (nueva versión) y marca los anteriores como no vigentes. */
  async addDocument(reservationId: string, type: 'TENTATIVA' | 'CONFIRMACION'): Promise<void> {
    const docs = await prisma.reservationDocument.findMany({ where: { reservationId }, select: { version: true } });
    const version = docs.reduce((m, d) => Math.max(m, d.version), 0) + 1;
    await prisma.reservationDocument.updateMany({ where: { reservationId }, data: { current: false } });
    await prisma.reservationDocument.create({ data: { reservationId, type, version, current: true } });
  },

  /** Marca habitaciones como canceladas; devuelve cuántas unidades quedan activas. */
  async cancelUnits(reservationId: string, roomIds: string[]): Promise<number> {
    if (roomIds.length) await prisma.reservationRoom.updateMany({ where: { id: { in: roomIds }, reservationId }, data: { unitStatus: 'CANCELADA' } });
    return prisma.reservationRoom.count({ where: { reservationId, unitStatus: { not: 'CANCELADA' } } });
  },

  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      await deleteChildren(tx, id);
      return tx.reservation.delete({ where: { id } });
    });
  },
};
