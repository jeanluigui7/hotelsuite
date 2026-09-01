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
import { operationsConfigService, requireReceptionFlag } from '../operations-config/operations-config.service';
import { prisma } from '../../config/prisma';
import { guestsRepository } from '../guests/guests.repository';
import { pernoctaService } from '../pernocta/pernocta.service';
import { wifiService } from '../wifi/wifi.service';
import { cashRepository } from '../cash/cash.repository';
import { staysRepository, type StayWithRelations } from './stays.repository';
import type { ChangeRoomDto, CheckInDto, CheckOutDto, PayStayDto, RenewDto, UpdateStayDetailsDto } from './stays.schema';

const SORTABLE = ['checkInAt', 'plannedCheckoutAt', 'status'] as const;

function serialize(stay: StayWithRelations) {
  return {
    id: stay.id,
    folioCode: stay.folioCode ?? null,
    reservationId: stay.reservationId ?? null,
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

const RENEWAL_DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Limpiezas de renovación por NOCHES acumuladas de la estadía (NO por eventos/pagos de renovación):
 *  - Noches totales = span real check-in → checkout programado, en días (el desfase por la hora
 *    de corte es < 1 día, así que redondea a la noche correcta).
 *  - possible = noches totales − 1  (la primera noche no genera limpieza).
 *  - enabled  = limpiezas habilitadas HASTA HOY: una por cada checkout de noche ya alcanzado
 *    mientras el huésped sigue alojado (no se entregan todas por adelantado).
 * Independiente de la cantidad de pagos/renovaciones, montos o si fue deuda o pago inmediato.
 */
function renewalCleaningCounts(stay: { checkInAt: Date; plannedCheckoutAt: Date }): { possible: number; enabled: number } {
  const ci = new Date(stay.checkInAt).getTime();
  const pco = new Date(stay.plannedCheckoutAt).getTime();
  const totalNights = Math.max(1, Math.round((pco - ci) / RENEWAL_DAY_MS));
  const possible = Math.max(0, totalNights - 1);
  if (possible === 0) return { possible: 0, enabled: 0 };
  // Checkout de la noche 1 = checkout final − (noches−1) días. Cada limpieza k habilita en el checkout de la noche k.
  const firstNightCheckout = pco - (totalNights - 1) * RENEWAL_DAY_MS;
  const now = Date.now();
  const enabled = now < firstNightCheckout ? 0 : Math.min(possible, Math.floor((now - firstNightCheckout) / RENEWAL_DAY_MS) + 1);
  return { possible, enabled };
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
    // Operación con dinero: requiere caja abierta (sin caja solo se verifica/visualiza).
    const cashOpen = await cashRepository.findOpen(branchId);
    if (!cashOpen) throw new ConflictError('Debes abrir caja para hacer check-in. Sin caja abierta solo puedes verificar y visualizar.');

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
      if (existing) {
        guestId = existing.id;
        // Actualiza nacionalidad / foto del documento si se enviaron en este check-in.
        if (dto.newGuest.nationality || dto.newGuest.documentPhotoUrl) {
          await guestsRepository.update(existing.id, {
            ...(dto.newGuest.nationality ? { nationality: dto.newGuest.nationality } : {}),
            ...(dto.newGuest.documentPhotoUrl ? { documentPhotoUrl: dto.newGuest.documentPhotoUrl } : {}),
          });
        }
      } else {
        guestId = (
          await guestsRepository.create({
            documentType: dto.newGuest.documentType,
            documentNumber: dto.newGuest.documentNumber,
            firstName: dto.newGuest.firstName,
            lastName: dto.newGuest.lastName || null,
            phone: dto.newGuest.phone || null,
            email: dto.newGuest.email || null,
            nationality: dto.newGuest.nationality || null,
            documentPhotoUrl: dto.newGuest.documentPhotoUrl || null,
            status: 'active',
          })
        ).id;
      }
    }
    if (!guestId) throw new ValidationError('Huésped requerido');

    // REGLA (lineamiento de turismo): un huésped no puede tener OTRA estadía activa.
    // Aplica al titular y a los acompañantes (por documento, principal o acompañante).
    const involvedIds = [guestId, ...dto.additionalGuestIds].filter((x): x is string => !!x);
    const activeStay = await prisma.stay.findFirst({
      where: { branchId, status: 'OPEN', OR: [{ guestId: { in: involvedIds } }, { additionalGuests: { some: { guestId: { in: involvedIds } } } }] },
      include: { room: { select: { number: true } } },
    });
    if (activeStay) {
      throw new ConflictError(`Este huésped ya tiene una estadía activa (Hab. ${activeStay.room?.number ?? '—'}). No se puede registrar en otra habitación hasta que haga su check-out.`);
    }

    // Bloqueo por margen de reserva (Configuración Operativa): no entregar una habitación
    // con una reserva inminente de OTRO huésped. Se exime la reserva que se está cumpliendo
    // (reservationId) y las reservas del mismo huésped.
    const opsCfg = await operationsConfigService.get(scope);
    const marginMin = opsCfg.reservaMarginMin ?? 60;
    if (marginMin > 0) {
      const now = new Date();
      const upperBound = new Date(now.getTime() + marginMin * 60_000); // reserva dentro del margen
      const graceLower = new Date(now.getTime() - 6 * 60 * 60_000); // ignora no-shows de más de 6 h
      const clashing = await prisma.reservation.findFirst({
        where: {
          branchId,
          roomId: dto.roomId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          expectedCheckInAt: { lte: upperBound, gte: graceLower },
          ...(dto.reservationId ? { id: { not: dto.reservationId } } : {}),
          // Exime solo las reservas del MISMO huésped; las sin huésped (guestId null) sí bloquean.
          ...(guestId ? { OR: [{ guestId: null }, { guestId: { not: guestId } }] } : {}),
        },
        orderBy: { expectedCheckInAt: 'asc' },
        include: { guest: { select: { firstName: true, lastName: true } } },
      });
      if (clashing) {
        const who = clashing.guestName || (clashing.guest ? `${clashing.guest.firstName} ${clashing.guest.lastName ?? ''}`.trim() : 'otro huésped');
        throw new ConflictError(`La habitación tiene una reserva inminente (${who}). Convierte esa reserva a check-in o elige otra habitación.`);
      }
    }

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
      reservationId: dto.reservationId ?? null,
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
    let lateCharge = 0;
    if (stay.durationMinutes >= 1440) {
      const q = await pernoctaService.quoteCheckOut(scope, stay.plannedCheckoutAt, new Date());
      if (q.lateCharge > 0) {
        lateCharge = q.lateCharge;
        const bd = stay.balanceDue ? Number(stay.balanceDue) : 0;
        await prisma.stay.update({ where: { id }, data: { balanceDue: round2(bd + q.lateCharge) } });
      }
    }
    const result = await staysRepository.checkOut(id, stay.roomId, dto.roomStatus, scope.userId, lateCharge > 0 ? lateCharge : null);
    // Al checkout, la credencial WiFi asignada a la estancia se consume ("Usada"), liberando el pool.
    await wifiService.releaseByStay(id);
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

    const isRoomLine = (desc: string): boolean => /^tarifa[:\s]/i.test(desc) || /pernocta|renovaci|tiempo extra|extensi/i.test(desc);
    const METHOD: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', WALLET: 'Billetera' };

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
        const isRenewal = /renovaci|tiempo extra|extensi/i.test(it.description);
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

    // Limpiezas de RENOVACIÓN por NOCHES acumuladas + avance real de la estadía (no por eventos):
    // allowed = limpiezas habilitadas hasta hoy; possible = total según noches; done = completadas.
    const { possible: cleaningPossible, enabled: cleaningAllowed } = renewalCleaningCounts(stay);
    const cleaningDone = stay.renewalCleaningDone ?? 0;
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

    // Estado de facturación (Etapa 4): comprobantes emitidos ligados a la estancia
    // (por stayId directo o por saleId de sus ventas). Deriva Pendiente / Parcial / Facturado.
    const saleIds = sales.map((s) => s.id);
    const stayInvoices = await prisma.invoice.findMany({
      where: { branchId, status: 'ISSUED', OR: [{ stayId: id }, ...(saleIds.length ? [{ saleId: { in: saleIds } }] : [])] },
      select: { series: true, number: true, total: true, type: true, issuedAt: true },
      orderBy: { issuedAt: 'asc' },
    });
    const invoicedAmount = round2(stayInvoices.reduce((a, inv) => a + Number(inv.total), 0));
    const billingStatus = invoicedAmount <= 0 ? 'PENDIENTE' : invoicedAmount + 0.01 >= total ? 'FACTURADO' : 'PARCIAL';
    const billing = {
      status: billingStatus,
      invoicedAmount,
      pending: round2(Math.max(0, total - invoicedAmount)),
      invoices: stayInvoices.map((inv) => ({ folio: `${inv.series}-${inv.number}`, type: inv.type, total: Number(inv.total), at: inv.issuedAt })),
    };

    return {
      folio: { code: stay.folioCode ?? `FP-${stay.id.slice(0, 6).toUpperCase()}`, status: stay.status === 'OPEN' ? 'Activa' : 'Cerrada' },
      guest: { name: `${stay.guest.firstName} ${stay.guest.lastName ?? ''}`.trim(), documentType: stay.guest.documentType, documentNumber: stay.guest.documentNumber, nationality: stay.guest.nationality, phone: stay.guest.phone },
      room: { number: room?.number ?? '—', typeName: room?.roomType.name ?? '—' },
      checkInAt: stay.checkInAt,
      plannedCheckoutAt: stay.plannedCheckoutAt,
      durationMinutes: stay.durationMinutes,
      renewals: renewalCount > 0 ? renewalCount : (renovaciones > 0 ? Math.max(1, Math.round(renovaciones / (habitacion || 1))) : 0),
      amounts: { habitacion, renovaciones, consumos: round2(consumos), total, paid },
      billing,
      cleaning: { done: cleaningDone, allowed: cleaningAllowed, possible: cleaningPossible, status: stay.renewalCleaningStatus, pernocta: stay.durationMinutes >= 1440 },
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
    // La renovación es una operación con dinero → requiere caja abierta (con o sin cobro inmediato).
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('Debes abrir caja para renovar. Sin caja abierta solo puedes verificar y visualizar.');
    const sessionId: string | null = session.id;
    const ref = dto.mode === 'HOURS' ? 'Tiempo extra (horas)' : 'Renovación de estadía';

    // La comisión POS (5% tarjeta) NO es ingreso del negocio (la retiene el proveedor): solo se
    // muestra al cobrar. Se registra el pago NETO tal cual, sin línea "Comisión POS".
    const adjPayments = payments;
    const saleTotal = round2(price);
    const paidWithComm = round2(adjPayments.reduce((a, p) => a + p.amount, 0));
    const saleItems: { description: string; quantity: number; unitPrice: number; subtotal: number }[] = [
      { description: `${ref}${dto.notes ? ' — ' + dto.notes : ''}`, quantity: 1, unitPrice: price, subtotal: price },
    ];

    // Solicitud inmediata de limpieza al renovar: solo si YA hay una limpieza habilitada
    // (se alcanzó el checkout de una noche). Si aún no, la renovación procede sin solicitarla;
    // se podrá solicitar después desde el folio cuando la estadía avance a ese checkout.
    const canRequestNow =
      dto.requestCleaning &&
      stay.renewalCleaningStatus === 'NONE' &&
      renewalCleaningCounts({ checkInAt: stay.checkInAt, plannedCheckoutAt: newCheckout }).enabled > (stay.renewalCleaningDone ?? 0);

    await prisma.$transaction([
      prisma.stay.update({
        where: { id },
        data: { plannedCheckoutAt: newCheckout, renewedAt: new Date(), renewalCount: { increment: 1 }, ...(canRequestNow ? { cleaningRequested: true, renewalCleaningStatus: 'SOLICITADA' } : {}) },
      }),
      prisma.sale.create({
        data: {
          branchId, stayId: id, guestId: stay.guestId, total: saleTotal,
          // PAID solo si se cubrió todo; parcial o diferido quedan OPEN (el saldo es deuda).
          status: saleTotal > 0 && paidWithComm >= saleTotal ? 'PAID' : 'OPEN', cashSessionId: sessionId, createdByUserId: scope.userId,
          items: { create: saleItems },
          ...(adjPayments.length ? { payments: { create: adjPayments.map((p) => ({ branchId, method: p.method, amount: round2(p.amount), reference: p.reference || null, cashSessionId: sessionId, createdByUserId: scope.userId })) } } : {}),
        },
      }),
    ]);
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
  },

  /**
   * Cobra el pendiente de una estancia: abona el monto a sus ventas OPEN (más antiguas
   * primero), marcándolas PAID al cubrirlas; el sobrante reduce el adeudo (balanceDue).
   * Resuelve el caso de una renovación diferida (deuda en una venta OPEN) que antes no
   * se podía pagar.
   */
  async pay(scope: RequestScope, id: string, dto: PayStayDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new ConflictError('Estancia no encontrada');
    const amount = round2(dto.amount);
    if (amount <= 0) throw new ValidationError('El monto debe ser mayor a 0.');
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('Debe abrir un turno de caja antes de registrar el cobro.');

    const openSales = await prisma.sale.findMany({ where: { stayId: id, status: 'OPEN' }, include: { payments: true }, orderBy: { createdAt: 'asc' } });
    const bd = stay.balanceDue ? Number(stay.balanceDue) : 0;
    const salesPending = openSales.reduce((a, s) => a + Math.max(0, Number(s.total) - s.payments.reduce((x, p) => x + Number(p.amount), 0)), 0);
    const pending = round2(salesPending + bd);
    if (pending <= 0) throw new ValidationError('Esta estancia no tiene pendiente por cobrar.');
    if (amount > pending + 0.001) throw new ValidationError(`El cobro (S/ ${amount.toFixed(2)}) excede el pendiente (S/ ${pending.toFixed(2)}).`);

    // La comisión POS NO es ingreso del negocio: se muestra solo al cobrar, no se registra.
    let remaining = amount;
    await prisma.$transaction(async (tx) => {
      for (const s of openSales) {
        if (remaining <= 0.001) break;
        const paid = s.payments.reduce((x, p) => x + Number(p.amount), 0);
        const saldo = round2(Number(s.total) - paid);
        if (saldo <= 0) continue;
        const pay = round2(Math.min(saldo, remaining));
        await tx.payment.create({ data: { branchId, saleId: s.id, method: dto.method, amount: pay, reference: dto.reference || null, cashSessionId: session.id, createdByUserId: scope.userId } });
        if (paid + pay >= Number(s.total) - 0.001) await tx.sale.update({ where: { id: s.id }, data: { status: 'PAID' } });
        remaining = round2(remaining - pay);
      }
      // Sobrante: cubre el adeudo legacy (early/late) guardado en balanceDue.
      if (remaining > 0.001 && bd > 0) {
        await tx.stay.update({ where: { id }, data: { balanceDue: round2(Math.max(0, bd - remaining)) } });
      }
    });
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
  },

  /**
   * Ciclo de la limpieza de renovación (NO libera la habitación; el huésped sigue dentro):
   *  start  → SOLICITADA → EN_CURSO
   *  finish → EN_CURSO → NONE (vuelve a OCUPADA)
   *  reject → SOLICITADA → NONE (cancela; solo si aún no inició). No afecta renovación/cobro/estadía.
   */
  async renewalCleaning(scope: RequestScope, id: string, action: 'start' | 'advance' | 'finish' | 'reject') {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    const st = stay.renewalCleaningStatus;
    const total = Math.max(1, await prisma.checklistItem.count({ where: { branchId, status: 'active' } }));
    if (action === 'start') {
      if (st !== 'SOLICITADA') throw new ConflictError('La limpieza no está en estado solicitada.');
      await prisma.stay.update({ where: { id }, data: { renewalCleaningStatus: 'EN_CURSO', renewalCleaningStep: 0 } });
    } else if (action === 'advance') {
      if (st !== 'EN_CURSO') throw new ConflictError('La limpieza no está en curso.');
      await prisma.stay.update({ where: { id }, data: { renewalCleaningStep: Math.min(total, stay.renewalCleaningStep + 1) } });
    } else if (action === 'reject') {
      if (st !== 'SOLICITADA') throw new ConflictError('Solo se puede rechazar mientras está solicitada (no iniciada).');
      await prisma.stay.update({ where: { id }, data: { renewalCleaningStatus: 'NONE', renewalCleaningStep: 0, cleaningRequested: false } });
    } else {
      // finish: requiere completar los pasos
      if (st !== 'EN_CURSO') throw new ConflictError('La limpieza no está en curso.');
      if (stay.renewalCleaningStep < total) throw new ConflictError(`Completa los pasos de la limpieza (${stay.renewalCleaningStep}/${total}).`);
      // Al finalizar, cuenta una limpieza de renovación como completada (avanza done/allowed).
      await prisma.stay.update({ where: { id }, data: { renewalCleaningStatus: 'NONE', renewalCleaningStep: 0, cleaningRequested: false, renewalCleaningDone: { increment: 1 } } });
    }
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
  },

  /**
   * Solicita una limpieza de RENOVACIÓN desde el folio: envía la habitación al personal de
   * limpieza (estado LIMPIEZA_SOLICITADA) sin liberar la estancia. Solo si hay una limpieza
   * programada pendiente (renovaciones > hechas) y no hay otra ya solicitada/en curso.
   */
  async requestRenewalCleaning(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    if (stay.status !== 'OPEN') throw new ConflictError('La estancia no está activa.');
    if (stay.renewalCleaningStatus !== 'NONE') throw new ConflictError('Ya hay una limpieza de renovación solicitada o en curso.');
    const { enabled: allowed } = renewalCleaningCounts(stay);
    const done = stay.renewalCleaningDone ?? 0;
    if (allowed <= done) throw new ConflictError('No hay una limpieza de renovación habilitada aún. Se habilita al llegar al checkout programado de cada noche mientras el huésped siga alojado.');
    const room = await prisma.room.findUnique({ where: { id: stay.roomId } });
    if (!room) throw new NotFoundError('Habitación no encontrada');
    if (room.status !== 'OCCUPIED') throw new ConflictError('La habitación debe estar Ocupada para solicitar una limpieza de renovación.');
    await prisma.room.update({ where: { id: stay.roomId }, data: { status: 'LIMPIEZA_SOLICITADA' } });
    await prisma.stay.update({ where: { id }, data: { renewalCleaningStatus: 'SOLICITADA', cleaningRequested: true } });
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
  },

  /** Cambia de habitación a una estancia activa y deja la de origen sucia o libre. */
  async changeRoom(scope: RequestScope, id: string, dto: ChangeRoomDto) {
    await requireReceptionFlag(scope, 'roomChange', 'El cambio de habitación requiere autorización de administración.');
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

  /**
   * Edición rápida de la estancia desde recepción: teléfono del titular, placa y
   * acompañantes (se registran con su documento; se crea el huésped si no existe).
   */
  async updateDetails(scope: RequestScope, id: string, dto: UpdateStayDetailsDto) {
    const branchId = requireActiveBranch(scope);
    const stay = await staysRepository.findById(id);
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');

    if (dto.vehiclePlate !== undefined) {
      await prisma.stay.update({ where: { id }, data: { vehiclePlate: dto.vehiclePlate.trim().toUpperCase() || null } });
    }
    if (dto.phone !== undefined) {
      await prisma.guest.update({ where: { id: stay.guestId }, data: { phone: dto.phone.trim() || null } });
    }
    for (const g of dto.addGuests ?? []) {
      let guest = await guestsRepository.findByDocument(g.documentType, g.documentNumber);
      if (!guest) {
        guest = await guestsRepository.create({
          documentType: g.documentType,
          documentNumber: g.documentNumber,
          firstName: g.firstName,
          lastName: g.lastName || null,
          phone: g.phone || null,
        });
      }
      if (guest.id !== stay.guestId) {
        await prisma.stayGuest.upsert({
          where: { stayId_guestId: { stayId: id, guestId: guest.id } },
          update: {},
          create: { stayId: id, guestId: guest.id },
        });
      }
    }
    for (const gid of dto.removeGuestIds ?? []) {
      await prisma.stayGuest.deleteMany({ where: { stayId: id, guestId: gid } });
    }
    const updated = await staysRepository.findById(id);
    return serialize(updated as StayWithRelations);
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

  /**
   * FOLIOS (Etapa 2): búsqueda histórica de estancias como folios económicos. Solo lectura,
   * reutiliza el listado de estancias. Añade a cada fila el total pagado y un indicador de
   * facturación (FACTURADO si la estancia tiene algún comprobante emitido; PENDIENTE si no).
   */
  async searchFolios(
    scope: RequestScope,
    params: PaginationParams,
    filters: { status?: string; folioCode?: string; doc?: string; reservationId?: string; roomId?: string; checkInFrom?: Date; checkInTo?: Date; q?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.StayWhereInput = { branchId };
    if (filters.status) where.status = filters.status;
    if (filters.folioCode) where.folioCode = { contains: filters.folioCode };
    if (filters.reservationId) where.reservationId = filters.reservationId;
    if (filters.roomId) where.roomId = filters.roomId;
    if (filters.checkInFrom || filters.checkInTo) {
      where.checkInAt = {
        ...(filters.checkInFrom ? { gte: filters.checkInFrom } : {}),
        ...(filters.checkInTo ? { lte: filters.checkInTo } : {}),
      };
    }
    if (filters.doc) where.guest = { documentNumber: { contains: filters.doc } };
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { folioCode: { contains: q } },
        { guest: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { documentNumber: { contains: q } }] } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      staysRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'checkInAt') }),
      staysRepository.count(where),
    ]);

    // Batch (sin N+1): pagos e indicador de facturación por estancia.
    const stayIds = rows.map((r) => r.id);
    const sales = stayIds.length
      ? await prisma.sale.findMany({
          where: { stayId: { in: stayIds }, status: { not: 'CANCELLED' } },
          select: { id: true, stayId: true, payments: { select: { amount: true } } },
        })
      : [];
    const invoices = sales.length
      ? await prisma.invoice.findMany({ where: { saleId: { in: sales.map((s) => s.id) }, status: 'ISSUED' }, select: { saleId: true } })
      : [];
    const invoicedSaleIds = new Set(invoices.map((i) => i.saleId));
    const paidByStay = new Map<string, number>();
    const invoicedByStay = new Map<string, boolean>();
    for (const s of sales) {
      if (!s.stayId) continue;
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      paidByStay.set(s.stayId, round2((paidByStay.get(s.stayId) ?? 0) + paid));
      if (invoicedSaleIds.has(s.id)) invoicedByStay.set(s.stayId, true);
    }

    const items = rows.map((r) => ({
      ...serialize(r),
      paid: paidByStay.get(r.id) ?? 0,
      billingStatus: invoicedByStay.get(r.id) ? 'FACTURADO' : 'PENDIENTE',
    }));
    return { items, meta: pageMeta(params, total) };
  },

  /**
   * Resumen económico por estancia para un conjunto de folios (usado por el Folio Maestro).
   * total = hospedaje (priceAgreed) + renovaciones + consumos, con la misma regla que folio().
   */
  async folioSummaries(scope: RequestScope, stayIds: string[]) {
    const branchId = requireActiveBranch(scope);
    const ids = [...new Set(stayIds)];
    if (!ids.length) return [] as ReturnType<typeof buildSummary>[];
    const [stays, sales] = await Promise.all([
      prisma.stay.findMany({
        where: { id: { in: ids }, branchId },
        include: { room: { select: { number: true } }, guest: { select: { firstName: true, lastName: true, documentNumber: true } } },
      }),
      prisma.sale.findMany({ where: { stayId: { in: ids }, status: { not: 'CANCELLED' } }, include: { items: true, payments: { select: { amount: true } } } }),
    ]);
    const invoices = await prisma.invoice.findMany({
      where: { branchId, status: 'ISSUED', OR: [{ stayId: { in: ids } }, ...(sales.length ? [{ saleId: { in: sales.map((s) => s.id) } }] : [])] },
      select: { stayId: true, saleId: true, total: true },
    });
    const saleStay = new Map(sales.map((s) => [s.id, s.stayId]));
    const isRoomLine = (d: string) => /^tarifa[:\s]/i.test(d) || /pernocta|renovaci|tiempo extra|extensi/i.test(d);
    const isRenewal = (d: string) => /renovaci|tiempo extra|extensi/i.test(d);

    const extraByStay = new Map<string, number>(); // renovaciones + consumos (líneas no-tarifa)
    const paidByStay = new Map<string, number>();
    for (const s of sales) {
      if (!s.stayId) continue;
      let extra = 0;
      for (const it of s.items) {
        if (isRenewal(it.description) || !isRoomLine(it.description)) extra += Number(it.subtotal);
      }
      extraByStay.set(s.stayId, round2((extraByStay.get(s.stayId) ?? 0) + extra));
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      paidByStay.set(s.stayId, round2((paidByStay.get(s.stayId) ?? 0) + paid));
    }
    const invoicedByStay = new Map<string, number>();
    for (const inv of invoices) {
      const sid = inv.stayId ?? (inv.saleId ? saleStay.get(inv.saleId) ?? null : null);
      if (!sid) continue;
      invoicedByStay.set(sid, round2((invoicedByStay.get(sid) ?? 0) + Number(inv.total)));
    }

    function buildSummary(st: (typeof stays)[number]) {
      const habitacion = round2(Number(st.priceAgreed));
      const extra = extraByStay.get(st.id) ?? round2(st.balanceDue ? Number(st.balanceDue) : 0);
      const total = round2(habitacion + extra);
      const paid = paidByStay.get(st.id) ?? 0;
      const invoiced = invoicedByStay.get(st.id) ?? 0;
      const billingStatus = invoiced <= 0 ? 'PENDIENTE' : invoiced + 0.01 >= total ? 'FACTURADO' : 'PARCIAL';
      return {
        id: st.id,
        folioCode: st.folioCode ?? null,
        status: st.status,
        checkInAt: st.checkInAt,
        checkOutAt: st.checkOutAt,
        room: st.room?.number ?? null,
        guest: `${st.guest.firstName} ${st.guest.lastName ?? ''}`.trim(),
        documentNumber: st.guest.documentNumber,
        total,
        paid,
        pending: round2(Math.max(0, total - paid)),
        billingStatus,
        invoiced,
      };
    }
    // Orden estable por fecha de ingreso.
    return stays.sort((a, b) => a.checkInAt.getTime() - b.checkInAt.getTime()).map(buildSummary);
  },

  /**
   * Backfill (una sola vez, superadmin): reconstruye el `lateCharge` de las estancias día-hotelero
   * ya cerradas con demora (el cargo que históricamente se sumaba al adeudo pero no se guardaba
   * por separado). El colaborador no es recuperable → permanece en NULL ("—" en el historial).
   */
  async backfillCheckoutCharges(scope: RequestScope) {
    if (!scope.isSuperAdmin) throw new ConflictError('Solo el superadministrador puede ejecutar el backfill.');
    const branches = await prisma.branch.findMany({ select: { id: true } });
    let scanned = 0;
    let updated = 0;
    for (const b of branches) {
      const rateSetting = await prisma.setting.findUnique({ where: { branchId_key: { branchId: b.id, key: 'pernocta.lateRatePerHour' } } });
      const rate = rateSetting?.value != null ? Number(rateSetting.value) : 0;
      if (!(rate > 0)) continue; // sin tarifa de demora configurada no hay cargo que reconstruir
      const stays = await prisma.stay.findMany({
        where: { branchId: b.id, status: 'CLOSED', checkOutAt: { not: null }, durationMinutes: { gte: 1440 }, lateCharge: null },
        select: { id: true, plannedCheckoutAt: true, checkOutAt: true },
      });
      for (const s of stays) {
        scanned++;
        const real = s.checkOutAt as Date;
        const diffMs = real.getTime() - s.plannedCheckoutAt.getTime();
        if (diffMs <= 0) continue;
        const lateHours = Math.ceil(diffMs / 3_600_000);
        const lateCharge = round2(lateHours * rate);
        if (lateCharge > 0) {
          await prisma.stay.update({ where: { id: s.id }, data: { lateCharge } });
          updated++;
        }
      }
    }
    return { branches: branches.length, scanned, updated };
  },

  /**
   * Historial de check-outs realizados (pestaña "Finalizados"), con filtros e indicadores.
   * Estado "cobro": para salidas con demora, se considera COBRADO cuando la estancia no
   * conserva adeudo pendiente (balanceDue <= 0); NO COBRADO si aún hay saldo.
   */
  async checkoutHistory(
    scope: RequestScope,
    params: PaginationParams,
    filters: { from?: Date; to?: Date; shift?: string; estado?: string; cobro?: string; collaboratorId?: string; roomId?: string; guest?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.StayWhereInput = { branchId, status: 'CLOSED' };
    where.checkOutAt = filters.from || filters.to
      ? { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }
      : { not: null };
    if (filters.roomId) where.roomId = filters.roomId;
    if (filters.collaboratorId) where.closedByUserId = filters.collaboratorId;
    if (filters.guest) {
      const g = filters.guest;
      where.guest = { OR: [{ firstName: { contains: g } }, { lastName: { contains: g } }, { documentNumber: { contains: g } }] };
    }

    const rows = await prisma.stay.findMany({
      where,
      include: { room: { select: { id: true, number: true } }, guest: { select: { firstName: true, lastName: true, documentNumber: true } } },
      orderBy: { checkOutAt: 'desc' },
    });
    const userIds = [...new Set(rows.map((r) => r.closedByUserId).filter((x): x is string => !!x))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const uMap = new Map(users.map((u) => [u.id, u.name]));
    const shiftOf = (d: Date): string => {
      const h = d.getHours() + d.getMinutes() / 60;
      if (h >= 6.5 && h < 14.5) return 'MANANA';
      if (h >= 14.5 && h < 22.5) return 'TARDE';
      return 'NOCHE';
    };

    const mapped = rows.map((r) => {
      const planned = r.plannedCheckoutAt;
      const real = r.checkOutAt as Date;
      const late = real.getTime() > planned.getTime();
      const lateCharge = r.lateCharge != null ? Number(r.lateCharge) : 0;
      const hasCharge = lateCharge > 0;
      const balance = r.balanceDue != null ? Number(r.balanceDue) : 0;
      const chargePaid = hasCharge ? balance <= 0.001 : null;
      const lateMinutes = late ? Math.round((real.getTime() - planned.getTime()) / 60000) : 0;
      return {
        id: r.id,
        folioCode: r.folioCode ?? null,
        room: r.room?.number ?? null,
        roomId: r.roomId,
        guest: `${r.guest.firstName} ${r.guest.lastName ?? ''}`.trim(),
        documentNumber: r.guest.documentNumber,
        plannedCheckoutAt: planned,
        checkOutAt: real,
        late,
        lateMinutes,
        lateCharge,
        hasCharge,
        chargePaid,
        closedBy: r.closedByUserId ? (uMap.get(r.closedByUserId) ?? '—') : '—',
        closedByUserId: r.closedByUserId ?? null,
        shift: shiftOf(real),
      };
    });

    // Opciones de filtro (colaboradores/habitaciones presentes en el rango).
    const collaborators = [...new Map(mapped.filter((m) => m.closedByUserId).map((m) => [m.closedByUserId!, { id: m.closedByUserId!, name: m.closedBy }])).values()];
    const rooms = [...new Map(mapped.filter((m) => m.roomId).map((m) => [m.roomId, { id: m.roomId, number: m.room ?? '' }])).values()];

    // Filtros en memoria (turno / estado / cobro) e indicadores sobre el conjunto filtrado.
    let filtered = mapped;
    if (filters.shift) filtered = filtered.filter((m) => m.shift === filters.shift);
    if (filters.estado === 'ONTIME') filtered = filtered.filter((m) => !m.late);
    if (filters.estado === 'LATE') filtered = filtered.filter((m) => m.late);
    if (filters.cobro === 'PAID') filtered = filtered.filter((m) => m.hasCharge && m.chargePaid);
    if (filters.cobro === 'UNPAID') filtered = filtered.filter((m) => m.hasCharge && !m.chargePaid);

    const indicators = {
      total: filtered.length,
      onTime: filtered.filter((m) => !m.late).length,
      late: filtered.filter((m) => m.late).length,
      charged: filtered.filter((m) => m.hasCharge && m.chargePaid).length,
      notCharged: filtered.filter((m) => m.hasCharge && !m.chargePaid).length,
    };

    const { skip, take } = toPrismaPaging(params);
    const items = filtered.slice(skip, skip + take);
    return { items, meta: pageMeta(params, filtered.length), indicators, collaborators, rooms };
  },

  /**
   * Historial de estancias enriquecido (paginado por turno en el frontend): tipo,
   * duración, monto, método/estado de pago, DNI, cliente, placa, observaciones y
   * el turno de recepción por la hora de ingreso.
   */
  async history(scope: RequestScope, filters: { from?: Date; to?: Date; search?: string }) {
    const branchId = requireActiveBranch(scope);
    const shifts = await prisma.roleShift.findMany({ where: { branchId, role: 'RECEPCION' } });
    const where: Prisma.StayWhereInput = { branchId };
    if (filters.from || filters.to) {
      where.checkInAt = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
    }
    if (filters.search) {
      where.guest = {
        OR: [
          { firstName: { contains: filters.search } },
          { lastName: { contains: filters.search } },
          { documentNumber: { contains: filters.search } },
        ],
      };
    }
    const stays = await staysRepository.list({ where, skip: 0, take: 500, orderBy: { checkInAt: 'desc' } });

    const stayIds = stays.map((s) => s.id);
    const sales = stayIds.length
      ? await prisma.sale.findMany({ where: { stayId: { in: stayIds }, status: { not: 'CANCELLED' } }, include: { payments: true } })
      : [];
    const pay = new Map<string, { charged: number; paid: number; methods: Set<string> }>();
    for (const sale of sales) {
      if (!sale.stayId) continue;
      const e = pay.get(sale.stayId) ?? { charged: 0, paid: 0, methods: new Set<string>() };
      e.charged = round2(e.charged + Number(sale.total));
      for (const p of sale.payments) { e.paid = round2(e.paid + Number(p.amount)); e.methods.add(p.method); }
      pay.set(sale.stayId, e);
    }

    const toMin = (h: string): number => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
    const ymdLocal = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const shiftFor = (at: Date): { shift: string; start: string; end: string; businessDate: string } => {
      const nowMin = at.getHours() * 60 + at.getMinutes();
      for (const s of shifts) {
        if (s.status !== 'active') continue;
        const start = toMin(s.startTime); const end = toMin(s.endTime); const overnight = end <= start;
        const inR = overnight ? nowMin >= start || nowMin < end : nowMin >= start && nowMin < end;
        if (!inR) continue;
        const d = new Date(at);
        if (overnight && nowMin < start) d.setDate(d.getDate() - 1);
        return { shift: s.shift, start: s.startTime, end: s.endTime, businessDate: ymdLocal(d) };
      }
      return { shift: 'MANANA', start: '', end: '', businessDate: ymdLocal(at) };
    };

    const now = new Date();
    const items = stays.map((s) => {
      const tipo = s.renewalCount > 0 ? 'RENOVACION' : s.rate?.pernocta || s.durationMinutes >= 1440 ? 'PERNOCTA' : 'ESTADIA_CORTA';
      const p = pay.get(s.id) ?? { charged: Number(s.priceAgreed), paid: 0, methods: new Set<string>() };
      const charged = p.charged > 0 ? p.charged : Number(s.priceAgreed);
      const owed = round2(charged - p.paid);
      const method = p.methods.size === 0 ? '' : p.methods.size === 1 ? [...p.methods][0] : 'MIXTO';
      const end = s.checkOutAt ?? now;
      const mins = Math.max(0, Math.round((end.getTime() - s.checkInAt.getTime()) / 60000));
      const h = Math.floor(mins / 60); const m = mins % 60;
      const duration = s.checkOutAt ? `${h}h ${m}min` : mins < 60 ? 'En curso' : `${h}h ${m}min en curso`;
      const sh = shiftFor(s.checkInAt);
      return {
        id: s.id,
        tipo,
        status: s.status,
        checkInAt: s.checkInAt,
        checkOutAt: s.checkOutAt,
        roomNumber: s.room?.number ?? null,
        duration,
        active: s.status === 'OPEN',
        amount: Number(s.priceAgreed),
        paid: p.paid,
        owed,
        method,
        paymentState: owed > 0.005 ? 'PENDIENTE' : 'PAGADO',
        dni: s.guest?.documentNumber ?? '',
        customer: `${s.guest?.firstName ?? ''} ${s.guest?.lastName ?? ''}`.trim(),
        plate: s.vehiclePlate ?? null,
        notes: s.notes ?? null,
        cleaningOk: s.renewalCleaningStatus === 'NONE' && s.renewalCount > 0,
        shift: sh.shift,
        shiftStart: sh.start,
        shiftEnd: sh.end,
        businessDate: sh.businessDate,
      };
    });
    return { items };
  },
};
