import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { guestsRepository } from '../guests/guests.repository';
import { pernoctaService } from '../pernocta/pernocta.service';
import { staysRepository, type StayWithRelations } from './stays.repository';
import type { CheckInDto, CheckOutDto } from './stays.schema';

const SORTABLE = ['checkInAt', 'plannedCheckoutAt', 'status'] as const;

function serialize(stay: StayWithRelations) {
  return {
    id: stay.id,
    status: stay.status,
    room: stay.room,
    guest: stay.guest,
    rate: stay.rate,
    tier: stay.tier,
    checkInAt: stay.checkInAt,
    plannedCheckoutAt: stay.plannedCheckoutAt,
    checkOutAt: stay.checkOutAt,
    durationMinutes: stay.durationMinutes,
    priceAgreed: stay.priceAgreed,
    balanceDue: stay.balanceDue,
    adults: stay.adults,
    children: stay.children,
    notes: stay.notes,
    additionalGuests: stay.additionalGuests.map((ag) => ({
      id: ag.guest.id,
      name: `${ag.guest.firstName} ${ag.guest.lastName ?? ''}`.trim(),
    })),
  };
}

/** priceAgreed = rate price minus the tier's discount, rounded to 2 decimals. */
function applyDiscount(price: number, discountPercent: number): number {
  const result = price * (1 - discountPercent / 100);
  return Math.round(result * 100) / 100;
}

export const staysService = {
  async checkIn(scope: RequestScope, dto: CheckInDto) {
    const branchId = requireActiveBranch(scope);

    const room = await prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room || room.branchId !== branchId) throw new NotFoundError('Habitación no encontrada');
    if (room.status !== 'FREE') throw new ConflictError('La habitación no está libre');

    const rate = await prisma.rate.findUnique({ where: { id: dto.rateId } });
    if (!rate || rate.branchId !== branchId) throw new ValidationError('Tarifa inválida');
    if (rate.roomTypeId !== room.roomTypeId) {
      throw new ValidationError('La tarifa no corresponde al tipo de la habitación');
    }

    let discount = 0;
    if (dto.tierId) {
      const tier = await prisma.clientTier.findUnique({ where: { id: dto.tierId } });
      if (!tier || tier.branchId !== branchId) throw new ValidationError('Tier inválido');
      discount = Number(tier.discountPercent);
    }

    // Resolve the guest: existing or newly created (guests are global).
    let guestId = dto.guestId;
    if (!guestId && dto.newGuest) {
      const existing = await guestsRepository.findByDocument(
        dto.newGuest.documentType,
        dto.newGuest.documentNumber,
      );
      guestId = existing
        ? existing.id
        : (
            await guestsRepository.create({
              documentType: dto.newGuest.documentType,
              documentNumber: dto.newGuest.documentNumber,
              firstName: dto.newGuest.firstName,
              lastName: dto.newGuest.lastName || null,
              phone: dto.newGuest.phone || null,
              email: dto.newGuest.email || null,
              status: 'active',
            })
          ).id;
    }
    if (!guestId) throw new ValidationError('Huésped requerido');

    const checkInAt = new Date();
    // Día hotelero: tarifas de día completo (>=1440 min) o etiquetadas "hotelero/noche"
    // usan horario fijo de pernocta (no 24h) y pueden generar cargo de early check-in.
    const isDiaHotelero = rate.durationMinutes >= 1440 || /hotelero|noche/i.test(rate.label);
    let plannedCheckoutAt: Date;
    let balanceDue: number | null = null;
    let earlyNote = '';
    if (isDiaHotelero) {
      const nights = Math.max(1, Math.round(rate.durationMinutes / 1440));
      const q = await pernoctaService.quoteCheckIn(scope, checkInAt, nights);
      plannedCheckoutAt = q.plannedCheckoutAt;
      if (q.earlyCharge > 0) {
        balanceDue = q.earlyCharge;
        earlyNote = ` Early check-in: ${q.earlyHours}h = ${q.earlyCharge}.`;
      }
    } else {
      plannedCheckoutAt = new Date(checkInAt.getTime() + rate.durationMinutes * 60_000);
    }
    const priceAgreed = applyDiscount(Number(rate.price), discount);

    const stay = await staysRepository.checkIn({
      branchId,
      roomId: room.id,
      guestId,
      rateId: rate.id,
      tierId: dto.tierId ?? null,
      durationMinutes: rate.durationMinutes,
      priceAgreed,
      balanceDue,
      checkInAt,
      plannedCheckoutAt,
      adults: dto.adults,
      children: dto.children,
      notes: ((dto.notes || '') + earlyNote).trim() || null,
      additionalGuestIds: dto.additionalGuestIds.filter((id) => id !== guestId),
    });
    return serialize(stay as StayWithRelations);
  },

  async checkOut(scope: RequestScope, id: string, dto: CheckOutDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    if (stay.status !== 'OPEN') throw new ConflictError('La estancia ya está cerrada');
    const result = await staysRepository.checkOut(id, stay.roomId, dto.roomStatus);
    return serialize(result as StayWithRelations);
  },

  async getById(scope: RequestScope, id: string) {
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Estancia no encontrada');
    }
    return serialize(stay);
  },

  async list(
    scope: RequestScope,
    params: PaginationParams,
    filters: { status?: string; roomId?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.StayWhereInput = { branchId };
    if (filters.status) where.status = filters.status;
    if (filters.roomId) where.roomId = filters.roomId;
    if (params.search) {
      where.guest = {
        OR: [
          { firstName: { contains: params.search } },
          { lastName: { contains: params.search } },
          { documentNumber: { contains: params.search } },
        ],
      };
    }
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      staysRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'checkInAt') }),
      staysRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },
};
