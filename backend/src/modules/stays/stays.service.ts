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
import { cashRepository } from '../cash/cash.repository';
import { staysRepository, type StayWithRelations } from './stays.repository';
import type { ChangeRoomDto, CheckInDto, CheckOutDto, RenewDto } from './stays.schema';

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
    vehiclePlate: stay.vehiclePlate,
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pendiente = recargos (balanceDue: early/late) + saldo no pagado de ventas OPEN de la estancia. */
async function computePending(stayId: string, balanceDue: Prisma.Decimal | number | null) {
  const sales = await prisma.sale.findMany({
    where: { stayId, status: { not: 'CANCELLED' } },
    include: { payments: true },
  });
  let salesPending = 0;
  for (const s of sales) {
    const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
    const owed = Number(s.total) - paid;
    if (owed > 0) salesPending += owed;
  }
  salesPending = round2(salesPending);
  const bd = balanceDue ? Number(balanceDue) : 0;
  return { balanceDue: bd, salesPending, total: round2(bd + salesPending) };
}

export const staysService = {
  async checkIn(scope: RequestScope, dto: CheckInDto) {
    const branchId = requireActiveBranch(scope);

    const room = await prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room || room.branchId !== branchId) throw new NotFoundError('Habitación no encontrada');
    // Se puede hacer check-in de una habitación libre o reservada.
    if (room.status !== 'FREE' && room.status !== 'RESERVADA') throw new ConflictError('La habitación no está disponible para check-in');

    // Tarifa del catálogo o "Tarifa personalizada" (sin rateId → salida + precio propios).
    let rate = null as Awaited<ReturnType<typeof prisma.rate.findUnique>> | null;
    if (dto.rateId) {
      rate = await prisma.rate.findUnique({ where: { id: dto.rateId } });
      if (!rate || rate.branchId !== branchId) throw new ValidationError('Tarifa inválida');
      if (rate.roomTypeId !== room.roomTypeId) {
        throw new ValidationError('La tarifa no corresponde al tipo de la habitación');
      }
    } else if (!dto.customCheckoutAt || dto.priceOverride == null) {
      throw new ValidationError('Tarifa personalizada: indica la fecha de salida y el precio');
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
    let plannedCheckoutAt: Date;
    const balanceDue: number | null = null;
    let earlyNote = '';
    let durationMinutes: number;
    let basePrice: number;
    if (!rate) {
      // Tarifa personalizada: salida y precio definidos por el usuario.
      plannedCheckoutAt = new Date(dto.customCheckoutAt!);
      durationMinutes = Math.max(1, Math.round((plannedCheckoutAt.getTime() - checkInAt.getTime()) / 60_000));
      basePrice = Number(dto.priceOverride);
    } else {
      // Día hotelero / pernoctación: lo define el FLAG de la tarifa (el sistema obvia la
      // duración listada). El corte se rige por la hora de corte de la sucursal. El texto
      // queda como respaldo solo para tarifas antiguas sin el flag.
      const isDiaHotelero = rate.pernocta || /hotelero|pernocta|pernoctaci/i.test(rate.label);
      durationMinutes = rate.durationMinutes;
      basePrice = Number(rate.price);
      if (isDiaHotelero) {
        // Pernoctación: 1 = hasta la próxima hora de corte; cada noche extra suma un día.
        const nights = dto.nights ?? 1;
        durationMinutes = nights * 1440;
        basePrice = Number(rate.price) * nights;
        // El early check-in (manual) mueve la salida al día siguiente; el monto se cobra como
        // línea de venta desde recepción (no hay cálculo automático por horas).
        const q = await pernoctaService.quoteCheckIn(scope, checkInAt, nights, dto.earlyCheckin ?? false);
        plannedCheckoutAt = q.plannedCheckoutAt;
        if (dto.earlyCheckin) earlyNote = ' Early check-in aplicado.';
      } else {
        plannedCheckoutAt = new Date(checkInAt.getTime() + rate.durationMinutes * 60_000);
      }
    }
    // Precio final editable (priceOverride) o tarifa con descuento de tier.
    const priceAgreed = dto.priceOverride != null ? round2(dto.priceOverride) : applyDiscount(basePrice, discount);

    const stay = await staysRepository.checkIn({
      branchId,
      roomId: room.id,
      guestId,
      rateId: rate?.id ?? null,
      tierId: dto.tierId ?? null,
      durationMinutes,
      priceAgreed,
      balanceDue,
      checkInAt,
      plannedCheckoutAt,
      adults: dto.adults,
      children: dto.children,
      vehiclePlate: (dto.vehiclePlate || '').trim().toUpperCase() || null,
      notes: ((dto.notes || '') + earlyNote).trim() || null,
      additionalGuestIds: dto.additionalGuestIds.filter((id) => id !== guestId),
    });
    return serialize(stay as StayWithRelations);
  },

  /** Pendiente de pago de una estancia: recargos (balanceDue) + ventas OPEN no pagadas. */
  async pending(scope: RequestScope, id: string) {
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Estancia no encontrada');
    return computePending(id, stay.balanceDue);
  },

  /** Resumen previo al check-out: pendiente actual + cargo de late check-out estimado. */
  async checkoutSummary(scope: RequestScope, id: string) {
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Estancia no encontrada');
    const isDia = stay.durationMinutes >= 1440;
    let lateHours = 0;
    let lateCharge = 0;
    if (isDia) {
      const q = await pernoctaService.quoteCheckOut(scope, stay.plannedCheckoutAt, new Date());
      lateHours = q.lateHours;
      lateCharge = q.lateCharge;
    }
    const p = await computePending(id, stay.balanceDue);
    return { ...p, lateHours, lateCharge, plannedCheckoutAt: stay.plannedCheckoutAt, totalWithLate: round2(p.total + lateCharge) };
  },

  async checkOut(scope: RequestScope, id: string, dto: CheckOutDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    if (stay.status !== 'OPEN') throw new ConflictError('La estancia ya está cerrada');
    // Late check-out: si es día hotelero y la salida supera la prevista, se cobra como adeudo.
    if (stay.durationMinutes >= 1440) {
      const q = await pernoctaService.quoteCheckOut(scope, stay.plannedCheckoutAt, new Date());
      if (q.lateCharge > 0) {
        const bd = stay.balanceDue ? Number(stay.balanceDue) : 0;
        await prisma.stay.update({ where: { id }, data: { balanceDue: round2(bd + q.lateCharge) } });
      }
    }
    const result = await staysRepository.checkOut(id, stay.roomId, dto.roomStatus);
    return serialize(result as StayWithRelations);
  },

  /** Folio de estancia: agrega huésped, fechas, montos, movimientos, productos, limpiezas y eventos. */
  async folio(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');

    const sales = await prisma.sale.findMany({
      where: { stayId: id, status: { not: 'CANCELLED' } },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'asc' },
    });
    const room = await prisma.room.findUnique({ where: { id: stay.roomId }, include: { roomType: { select: { name: true } } } });
    const tasks = await prisma.housekeepingTask.findMany({ where: { branchId, roomId: stay.roomId, createdAt: { gte: stay.checkInAt } }, orderBy: { createdAt: 'asc' } });

    // Nombres de responsables
    const userIds = [...new Set([...sales.map((s) => s.createdByUserId), ...sales.flatMap((s) => s.payments.map((p) => p.createdByUserId)), ...tasks.map((t) => t.assignedToUserId)].filter((x): x is string => !!x))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const uname = (uid?: string | null): string => (uid ? users.find((u) => u.id === uid)?.name ?? '—' : '—');

    const isRoomLine = (desc: string): boolean => /^tarifa[:\s]/i.test(desc) || /pernocta|renovaci/i.test(desc);
    const METHOD: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', WALLET: 'Yape/Plin' };

    // Movimientos (ledger) y productos
    type Mov = { at: Date; type: string; description: string; method?: string; charge: number; payment: number; by: string };
    const movs: Mov[] = [];
    const products: { name: string; quantity: number; amount: number; at: Date; paid: boolean }[] = [];
    let consumos = 0;
    let renovacionesSales = 0; // cargos de renovación (líneas de venta "Renovación")
    let renewalCount = 0;
    for (const s of sales) {
      const paidSale = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      const fullyPaid = paidSale + 0.001 >= Number(s.total);
      for (const it of s.items) {
        const sub = Number(it.subtotal);
        const isRenewal = /renovaci/i.test(it.description);
        movs.push({ at: s.createdAt, type: isRoomLine(it.description) ? 'Estadía' : 'Producto', description: it.description, charge: sub, payment: 0, by: uname(s.createdByUserId) });
        if (isRenewal) { renovacionesSales += sub; renewalCount += it.quantity; }
        else if (!isRoomLine(it.description)) {
          consumos += sub;
          products.push({ name: it.description, quantity: it.quantity, amount: sub, at: s.createdAt, paid: fullyPaid });
        }
      }
      for (const p of s.payments) {
        movs.push({ at: p.createdAt, type: 'Pago', description: `Pago - ${METHOD[p.method] ?? p.method}`, method: p.method, charge: 0, payment: Number(p.amount), by: uname(p.createdByUserId) });
      }
    }
    movs.sort((a, b) => a.at.getTime() - b.at.getTime());
    let bal = 0;
    const movements = movs.map((m) => { bal = Math.round((bal + m.charge - m.payment) * 100) / 100; return { ...m, balance: bal }; });

    // Limpiezas
    const totalDays = Math.max(1, Math.ceil(stay.durationMinutes / 1440));
    const cleaningAllowed = Math.max(0, totalDays - 1);
    const cleaningDone = tasks.filter((t) => t.status === 'DONE' || t.status === 'INSPECTED').length;
    const cleaningLog = tasks.map((t) => ({ at: t.completedAt ?? t.createdAt, action: t.status === 'PENDING' ? 'Solicitó' : t.status === 'IN_PROGRESS' ? 'Inició' : 'Finalizó', by: uname(t.assignedToUserId) }));

    const habitacion = round2(Number(stay.priceAgreed));
    // Renovaciones: cargos de renovación registrados como venta (con respaldo legacy en balanceDue).
    const renovaciones = renovacionesSales > 0 ? round2(renovacionesSales) : round2(stay.balanceDue ? Number(stay.balanceDue) : 0);
    const total = round2(habitacion + renovaciones + consumos);
    const paid = round2(sales.flatMap((s) => s.payments).reduce((a, p) => a + Number(p.amount), 0));
    const hospedaje = round2(habitacion + renovaciones);
    const ratio = hospedaje > 0 ? Math.round((consumos / hospedaje) * 1000) / 10 : 0;
    const limit = 20;
    const exceeded = ratio > limit;

    return {
      folio: { code: `FP-${stay.id.slice(0, 6).toUpperCase()}`, status: stay.status === 'OPEN' ? 'Activa' : 'Cerrada' },
      guest: { name: `${stay.guest.firstName} ${stay.guest.lastName ?? ''}`.trim(), documentNumber: stay.guest.documentNumber, phone: stay.guest.phone },
      room: { number: room?.number ?? '—', typeName: room?.roomType.name ?? '—' },
      checkInAt: stay.checkInAt,
      plannedCheckoutAt: stay.plannedCheckoutAt,
      durationMinutes: stay.durationMinutes,
      renewals: renewalCount > 0 ? renewalCount : (renovaciones > 0 ? Math.max(1, Math.round(renovaciones / (habitacion || 1))) : 0),
      amounts: { habitacion, renovaciones, consumos: round2(consumos), total, paid },
      cleaning: { done: cleaningDone, allowed: cleaningAllowed },
      cleaningLog,
      movements,
      products,
      simulator: {
        hospedaje, productos: round2(consumos), ratio, limit, exceeded,
        exceso: exceeded ? round2(consumos - hospedaje * limit / 100) : 0,
        igvAdicional: exceeded ? round2((consumos - hospedaje * limit / 100) * 0.18) : 0,
        suggested: round2(consumos / (limit / 100)),
      },
    };
  },

  /** Renueva/extiende la pernocta: agrega otra duración de tarifa y suma su precio al adeudo. */
  /**
   * Renovación de pernocta: extiende la salida, registra el cargo (cobrado ahora o pendiente),
   * marca la estancia como RENOVADA y, si se pide, deja una limpieza de renovación pendiente
   * (que NO libera la habitación: el huésped sigue dentro).
   */
  async renew(scope: RequestScope, id: string, dto: RenewDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new ConflictError('Estancia no encontrada');
    if (stay.status !== 'OPEN') throw new ConflictError('La estancia ya está cerrada');

    // Nueva salida: por calendario (newCheckoutAt) o por +horas; debe ser posterior a la actual.
    const current = new Date(stay.plannedCheckoutAt);
    let newCheckout: Date;
    if (dto.newCheckoutAt) {
      newCheckout = new Date(dto.newCheckoutAt);
    } else if (dto.mode === 'HOURS' && dto.hours) {
      newCheckout = new Date(current.getTime() + dto.hours * 3_600_000);
    } else {
      newCheckout = new Date(current.getTime() + (dto.nights ?? 1) * stay.durationMinutes * 60_000);
    }
    if (newCheckout.getTime() <= current.getTime()) throw new ValidationError('La nueva salida debe ser posterior a la salida actual.');

    const price = round2(dto.amount);
    const payments = dto.payments.filter((p) => p.amount > 0);
    const paidNow = round2(payments.reduce((a, p) => a + p.amount, 0));
    if (paidNow > price) throw new ValidationError('Lo cobrado excede el monto de la renovación.');

    // Si hay cobro ahora, el pago se registra atado a un turno de caja abierto.
    let sessionId: string | null = null;
    if (paidNow > 0) {
      const session = await cashRepository.findOpen(branchId);
      if (!session) throw new ConflictError('Para cobrar la renovación debe haber un turno de caja abierto.');
      sessionId = session.id;
    }
    const ref = dto.mode === 'HOURS' ? 'Tiempo extra (horas)' : 'Renovación de estadía';

    await prisma.$transaction([
      prisma.stay.update({
        where: { id },
        data: { plannedCheckoutAt: newCheckout, renewedAt: new Date(), renewalCount: { increment: 1 }, ...(dto.requestCleaning ? { cleaningRequested: true } : {}) },
      }),
      prisma.sale.create({
        data: {
          branchId, stayId: id, guestId: stay.guestId, total: price,
          // PAID solo si se cubrió todo; parcial o diferido quedan OPEN (el saldo es deuda).
          status: price > 0 && paidNow >= price ? 'PAID' : 'OPEN', cashSessionId: sessionId, createdByUserId: scope.userId,
          items: { create: [{ description: `${ref}${dto.notes ? ' — ' + dto.notes : ''}`, quantity: 1, unitPrice: price, subtotal: price }] },
          ...(payments.length ? { payments: { create: payments.map((p) => ({ branchId, method: p.method, amount: round2(p.amount), reference: p.reference || null, cashSessionId: sessionId, createdByUserId: scope.userId })) } } : {}),
        },
      }),
    ]);
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
  },

  /** Marca la limpieza de renovación como realizada. La habitación sigue OCUPADA (no se libera). */
  async renewalCleaningDone(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    await prisma.stay.update({ where: { id }, data: { cleaningRequested: false } });
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
  },

  /** Cambia de habitación a una estancia activa y deja la de origen sucia o libre. */
  async changeRoom(scope: RequestScope, id: string, dto: ChangeRoomDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    if (stay.status !== 'OPEN') throw new ConflictError('La estancia ya está cerrada');
    if (dto.destRoomId === stay.roomId) throw new ValidationError('La habitación de destino es la misma');
    const dest = await prisma.room.findUnique({ where: { id: dto.destRoomId } });
    if (!dest || dest.branchId !== branchId) throw new NotFoundError('Habitación de destino no encontrada');
    if (dest.status !== 'FREE') throw new ConflictError('La habitación de destino no está disponible');
    const result = await staysRepository.changeRoom(id, stay.roomId, dto.destRoomId, dto.originStatus);
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
