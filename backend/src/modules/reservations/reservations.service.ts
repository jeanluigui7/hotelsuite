import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { buildOrderBy, pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { recordActivity } from '../activity-log/activity.emitter';
import { cashRepository } from '../cash/cash.repository';
import { reservationsRepository, type ReservationFull, type ReservationListRow, type RichReservationInput } from './reservations.repository';
import { availabilityService } from './availability.service';
import { reservationsConfigService } from '../reservations-config/reservations-config.service';
import type { AddPaymentDto, ChangeStatusDto, CreateReservationDto, UpdateReservationDto } from './reservations.schema';

const SORTABLE = ['expectedCheckInAt', 'createdAt', 'status'] as const;

const STATUS_FROM_ESTADO: Record<string, string> = { TENTATIVA: 'PENDING', CONFIRMADA: 'CONFIRMED', CANCELADA: 'CANCELLED', NO_SHOW: 'NO_SHOW', VENCIDA: 'EXPIRED' };
const ESTADO_FROM_STATUS: Record<string, string> = { PENDING: 'TENTATIVA', CONFIRMED: 'CONFIRMADA', CANCELLED: 'CANCELADA', FULFILLED: 'FINALIZADA', EXPIRED: 'VENCIDA', NO_SHOW: 'NO_SHOW', IN_STAY: 'EN_ESTADIA' };

const num = (d: Prisma.Decimal | number | null | undefined): number | null => (d == null ? null : Number(d));
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function paymentStatusOf(total: number, paid: number): string {
  if (paid <= 0) return 'SIN_PAGO';
  if (total > 0 && paid >= total) return 'PAGADO';
  return 'PARCIAL';
}

function serialize(r: ReservationFull) {
  const rooms = r.rooms.map((h) => ({
    uid: h.id,
    roomTypeId: h.roomTypeId,
    roomTypeName: h.roomTypeName,
    roomId: h.roomId,
    roomNumber: h.roomNumber,
    rateId: h.rateId,
    precio: num(h.price),
    adults: h.adults,
    children: h.children,
    guestsCount: h.adults + h.children,
    requisitos: h.attributes.filter((a) => a.kind === 'REQUISITO').map((a) => a.attributeName),
    preferencias: h.attributes.filter((a) => a.kind === 'PREFERENCIA').map((a) => a.attributeName),
    huespedes: h.guests.map((g) => ({ uid: g.id, firstName: g.firstName, lastName: g.lastName ?? undefined, documentType: g.documentType ?? undefined, documentNumber: g.documentNumber ?? undefined, nationality: g.nationality ?? undefined, phone: g.phone ?? undefined })),
    estadoUnidad: h.unitStatus,
  }));
  const asignadas = rooms.filter((h) => !!h.roomId).length;
  const estadoAsignacion = asignadas === 0 ? 'SIN_ASIGNAR' : asignadas === rooms.length ? 'ASIGNADA' : 'PARCIAL';
  return {
    id: r.id,
    codigo: r.code ?? `R-${r.id.slice(0, 6)}`,
    estadoReserva: ESTADO_FROM_STATUS[r.status] ?? 'TENTATIVA',
    estadoPago: r.paymentStatus,
    estadoAsignacion,
    modalidad: r.modalidad,
    entradaAt: r.expectedCheckInAt.toISOString(),
    salidaAt: iso(r.expectedCheckOutAt) ?? new Date(r.expectedCheckInAt.getTime() + (r.durationMinutes || 1440) * 60000).toISOString(),
    contacto: {
      tipo: r.contactType,
      guestId: r.guestId,
      documentType: r.contactDocType ?? undefined,
      documentNumber: r.contactDocNumber ?? undefined,
      nombre: r.contactName ?? r.guestName ?? 'Cliente',
      telefono: r.contactPhone ?? r.phone ?? undefined,
      telefonoAlt: r.contactPhoneAlt ?? undefined,
      email: r.contactEmail ?? undefined,
    },
    habitaciones: rooms,
    cochera: {
      requiere: r.parkingRequired,
      vehiculos: r.parkingVehicles,
      estado: r.parkingStatus,
      precio: num(r.parkingPrice),
      placas: r.parkingPlates ? r.parkingPlates.split(',').map((s) => s.trim()).filter(Boolean) : [],
    },
    origen: r.origin,
    total: num(r.total),
    pagado: num(r.paid),
    saldo: num(r.balance),
    pagos: r.payments.map((p) => ({ id: p.id, importe: num(p.amount) ?? 0, medio: p.method, destino: p.destination ?? undefined, fecha: p.paidAt.toISOString(), operacion: p.reference ?? undefined, observacion: p.note ?? undefined, tipo: p.kind, conciliado: p.conciliated })),
    pagosProgramados: r.scheduledPayments.map((s) => ({ id: s.id, vence: iso(s.dueAt) ?? '', modo: s.mode, valor: num(s.value) ?? 0, base: s.base, importeCalculado: num(s.amount) ?? 0 })),
    documentos: r.documents.map((d) => ({ id: d.id, tipo: d.type, version: d.version, vigente: d.current, final: d.final, emitidoAt: d.issuedAt.toISOString() })),
    condiciones: {
      politicaNombre: r.policyName,
      politicaVersion: r.policyVersion,
      adelantoRequerido: num(r.advanceRequired),
      plazoPago: r.cancellationTerms ? undefined : undefined,
      venceTentativaAt: iso(r.tentativeDueAt),
      cancelacion: r.cancellationTerms,
      noShow: r.noShowTerms,
      aceptacion: r.acceptance,
    },
    notaInterna: r.internalNote ?? r.notes,
    observacionCliente: r.clientNote,
    createdAt: r.createdAt.toISOString(),
    createdByName: null,
    origin: 'REAL',
    persistencia: 'CONECTADO',
  };
}

/**
 * ETAPA 4C · snapshot inmutable del documento (JSON de términos + montos + cliente + habitaciones +
 * identidad del hotel) congelado al emitirlo, para reproducir el documento aunque la reserva cambie.
 */
async function buildDocSnapshot(branchId: string, full: ReservationFull): Promise<string> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true, legalName: true, taxId: true, address: true, phone: true, email: true, logoUrl: true },
  });
  const snap = {
    emitidoAt: new Date().toISOString(),
    hotel: branch
      ? { nombre: branch.name, legalName: branch.legalName, ruc: branch.taxId, direccion: branch.address, telefono: branch.phone, email: branch.email, logoUrl: branch.logoUrl }
      : null,
    reserva: serialize(full),
  };
  return JSON.stringify(snap);
}

function serializeList(r: ReservationListRow) {
  const asignadas = r.rooms.filter((h) => !!h.roomId).length;
  const estadoAsignacion = asignadas === 0 ? 'SIN_ASIGNAR' : asignadas === r.rooms.length ? 'ASIGNADA' : 'PARCIAL';
  return {
    id: r.id,
    codigo: r.code ?? `R-${r.id.slice(0, 6)}`,
    estadoReserva: ESTADO_FROM_STATUS[r.status] ?? 'TENTATIVA',
    estadoPago: r.paymentStatus,
    estadoAsignacion,
    modalidad: r.modalidad,
    entradaAt: r.expectedCheckInAt.toISOString(),
    salidaAt: iso(r.expectedCheckOutAt) ?? new Date(r.expectedCheckInAt.getTime() + (r.durationMinutes || 1440) * 60000).toISOString(),
    contacto: { tipo: r.contactType, guestId: r.guestId, nombre: r.contactName ?? r.guestName ?? 'Cliente', telefono: r.contactPhone ?? r.phone ?? undefined },
    habitaciones: r.rooms.map((h, i) => ({ uid: `${r.id}-${i}`, roomTypeId: null, roomTypeName: h.roomTypeName, roomId: h.roomId, roomNumber: h.roomNumber, guestsCount: 0, requisitos: [], preferencias: [], huespedes: [], estadoUnidad: h.unitStatus, precio: null })),
    cochera: { requiere: r.parkingRequired, vehiculos: r.parkingVehicles, estado: r.parkingStatus, precio: num(r.parkingPrice), placas: [] },
    origen: r.origin,
    total: num(r.total),
    pagado: num(r.paid),
    saldo: num(r.balance),
    pagos: [],
    pagosProgramados: [],
    documentos: [],
    condiciones: { venceTentativaAt: iso(r.tentativeDueAt), aceptacion: r.acceptance },
    notaInterna: r.internalNote ?? r.notes,
    observacionCliente: r.clientNote,
    createdAt: r.createdAt.toISOString(),
    createdByName: null,
    origin: 'REAL',
    persistencia: 'CONECTADO',
  };
}

async function assertRefs(branchId: string, dto: CreateReservationDto): Promise<void> {
  const typeIds = [...new Set(dto.habitaciones.map((h) => h.roomTypeId))];
  const types = await prisma.roomType.findMany({ where: { id: { in: typeIds }, branchId }, select: { id: true, name: true } });
  const typeMap = new Map(types.map((t) => [t.id, t.name]));
  for (const id of typeIds) if (!typeMap.has(id)) throw new ValidationError('Tipo de habitación inválido');
  const roomIds = dto.habitaciones.map((h) => h.roomId).filter((x): x is string => !!x);
  if (roomIds.length) {
    const rooms = await prisma.room.findMany({ where: { id: { in: roomIds }, branchId }, select: { id: true } });
    const ok = new Set(rooms.map((r) => r.id));
    for (const id of roomIds) if (!ok.has(id)) throw new ValidationError('Habitación inválida');
  }
}

async function buildInput(branchId: string, scope: RequestScope, dto: CreateReservationDto, code: string): Promise<{ input: RichReservationInput; total: number; paid: number }> {
  const typeIds = [...new Set(dto.habitaciones.map((h) => h.roomTypeId))];
  const types = await prisma.roomType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } });
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const roomIds = dto.habitaciones.map((h) => h.roomId).filter((x): x is string => !!x);
  const rooms = roomIds.length ? await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }) : [];
  const roomNumber = new Map(rooms.map((r) => [r.id, r.number]));

  const roomsTotal = dto.habitaciones.reduce((s, h) => s + (h.precio ?? 0), 0);
  const parkingTotal = dto.cochera?.requiere ? dto.cochera.precio ?? 0 : 0;
  const total = roomsTotal + parkingTotal;
  const paid = dto.pagos.reduce((s, p) => s + p.importe, 0);
  const balance = total - paid;
  const durationMinutes = Math.max(1, Math.round((dto.salidaAt.getTime() - dto.entradaAt.getTime()) / 60000));
  const primary = dto.habitaciones[0];

  // ETAPA 4B · defaults de política desde la config de la sucursal. El DTO manda; donde el asistente
  // no fija condiciones, se siembran (y se congelan en la reserva) desde /settings/reservas.
  const now = new Date();
  const statusComputed = STATUS_FROM_ESTADO[dto.estado] ?? 'PENDING';
  const cfg = await reservationsConfigService.getForBranch(branchId);
  const r2 = (n: number): number => Math.round(n * 100) / 100;
  const inRange = (desde: string, hasta: string): boolean => {
    const t = now.getTime();
    const from = desde ? new Date(desde).getTime() : NaN;
    const to = hasta ? new Date(hasta).getTime() : NaN;
    if (!Number.isNaN(from) && t < from) return false;
    if (!Number.isNaN(to) && t > to) return false;
    return true;
  };
  const activePolicy =
    cfg.politicas.find((p) => p.ambito === 'RESERVA' && inRange(p.vigenciaDesde, p.vigenciaHasta)) ??
    cfg.politicas.find((p) => p.ambito === 'RESERVA') ??
    null;

  const reservation: Prisma.ReservationUncheckedCreateInput = {
    branchId,
    code,
    roomTypeId: primary.roomTypeId,
    roomId: primary.roomId ?? null,
    guestId: dto.contacto.guestId ?? null,
    guestName: dto.contacto.nombre ?? null,
    phone: dto.contacto.telefono ?? null,
    modalidad: dto.modalidad,
    expectedCheckInAt: dto.entradaAt,
    expectedCheckOutAt: dto.salidaAt,
    durationMinutes,
    adults: dto.habitaciones.reduce((s, h) => s + h.adults, 0),
    children: dto.habitaciones.reduce((s, h) => s + h.children, 0),
    status: statusComputed,
    paymentStatus: paymentStatusOf(total, paid),
    origin: dto.origen,
    contactType: dto.contacto.tipo,
    contactDocType: dto.contacto.documentType ?? null,
    contactDocNumber: dto.contacto.documentNumber ?? null,
    contactName: dto.contacto.nombre ?? null,
    contactPhone: dto.contacto.telefono ?? null,
    contactPhoneAlt: dto.contacto.telefonoAlt ?? null,
    contactEmail: dto.contacto.email ?? null,
    total,
    paid,
    balance,
    policyName: dto.condiciones?.politicaNombre ?? activePolicy?.nombre ?? null,
    policyVersion: dto.condiciones?.politicaVersion ?? activePolicy?.version ?? null,
    advanceRequired: dto.condiciones?.adelantoRequerido ?? (cfg.pagos.adelantoPct > 0 ? r2(total * cfg.pagos.adelantoPct / 100) : null),
    tentativeDueAt: dto.condiciones?.venceTentativaAt ?? (statusComputed === 'PENDING' && cfg.tentativas.vigenciaHoras > 0 ? new Date(now.getTime() + cfg.tentativas.vigenciaHoras * 3_600_000) : null),
    cancellationTerms: dto.condiciones?.cancelacion ?? (cfg.cancelacion.textoCancelacion || null),
    noShowTerms: dto.condiciones?.noShow ?? (cfg.cancelacion.textoNoShow || null),
    acceptance: dto.condiciones?.aceptacion ?? 'PENDIENTE',
    parkingRequired: dto.cochera?.requiere ?? false,
    parkingVehicles: dto.cochera?.vehiculos ?? 0,
    parkingStatus: dto.cochera?.estado ?? 'SOLICITADA',
    parkingPrice: dto.cochera?.precio ?? null,
    parkingPlates: dto.cochera?.placas?.length ? dto.cochera.placas.join(', ') : null,
    internalNote: dto.notaInterna ?? null,
    clientNote: dto.observacionCliente ?? null,
    createdByUserId: scope.userId,
  };

  const inputRooms = dto.habitaciones.map((h, i) => ({
    room: {
      roomTypeId: h.roomTypeId,
      roomTypeName: h.roomTypeName ?? typeName.get(h.roomTypeId) ?? null,
      roomId: h.roomId ?? null,
      roomNumber: h.roomId ? roomNumber.get(h.roomId) ?? h.roomNumber ?? null : null,
      rateId: h.rateId ?? null,
      price: h.precio ?? null,
      adults: h.adults,
      children: h.children,
      unitStatus: h.roomId ? 'ASIGNADA' : 'RESERVADA',
      sortOrder: i,
    },
    attributes: [
      ...h.requisitos.map((name) => ({ attributeName: name, kind: 'REQUISITO' })),
      ...h.preferencias.map((name) => ({ attributeName: name, kind: 'PREFERENCIA' })),
    ],
    guests: h.huespedes.map((g) => ({ guestId: g.guestId ?? null, firstName: g.firstName, lastName: g.lastName ?? null, documentType: g.documentType ?? null, documentNumber: g.documentNumber ?? null, nationality: g.nationality ?? null, phone: g.phone ?? null })),
  }));

  const payments = dto.pagos.map((p) => ({ amount: p.importe, method: p.medio, destination: p.destino ?? null, reference: p.operacion ?? null, note: p.observacion ?? null, kind: 'RECIBIDO', paidAt: p.fecha ?? new Date(), createdByUserId: scope.userId }));
  const scheduled = dto.pagosProgramados.map((s) => {
    const base = s.base === 'TOTAL' ? total : balance;
    const amount = s.modo === 'FIJO' ? s.valor : Math.round(base * (s.valor / 100) * 100) / 100;
    return { dueAt: s.vence ?? null, mode: s.modo, value: s.valor, base: s.base, amount };
  });

  return { input: { reservation, rooms: inputRooms, payments, scheduled }, total, paid };
}

export const reservationsService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    // Vencimiento automático de tentativas pasadas (auto-vencer).
    await prisma.reservation.updateMany({ where: { branchId, status: 'PENDING', tentativeDueAt: { not: null, lt: new Date() } }, data: { status: 'EXPIRED' } });
    const where: Prisma.ReservationWhereInput = { branchId };
    if (status) where.status = status;
    if (params.search) {
      where.OR = [
        { contactName: { contains: params.search } },
        { guestName: { contains: params.search } },
        { code: { contains: params.search } },
        { contactPhone: { contains: params.search } },
        { contactDocNumber: { contains: params.search } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      reservationsRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'expectedCheckInAt') }),
      reservationsRepository.count(where),
    ]);
    return { items: rows.map(serializeList), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string): Promise<ReservationFull> {
    const r = await reservationsRepository.findById(id);
    if (!r || r.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Reserva no encontrada');
    return r;
  },

  async getById(scope: RequestScope, id: string) {
    return serialize(await this.getEntity(scope, id));
  },

  /** ETAPA 4C · snapshot congelado de un documento emitido (para imprimir/descargar el definitivo). */
  async getDocumentSnapshot(scope: RequestScope, reservationId: string, docId: string) {
    await this.getEntity(scope, reservationId); // valida pertenencia a la sucursal del usuario
    const doc = await reservationsRepository.getDocument(docId);
    if (!doc || doc.reservationId !== reservationId) throw new NotFoundError('Documento no encontrado');
    return {
      id: doc.id,
      tipo: doc.type,
      version: doc.version,
      vigente: doc.current,
      final: doc.final,
      emitidoAt: doc.issuedAt.toISOString(),
      snapshot: doc.snapshot ? (JSON.parse(doc.snapshot) as unknown) : null,
    };
  },

  async create(scope: RequestScope, dto: CreateReservationDto) {
    const branchId = requireActiveBranch(scope);
    await assertRefs(branchId, dto);
    await availabilityService.assertAssignedRoomsFree(scope, dto);
    const code = dto.codigo && /R-\d+/i.test(dto.codigo) ? dto.codigo : `R-${String((await reservationsRepository.maxCodeNumber(branchId)) + 1).padStart(4, '0')}`;
    const { input } = await buildInput(branchId, scope, dto, code);
    const r = await reservationsRepository.createFull(input);
    const fullNew = (await reservationsRepository.findById(r.id))!;
    const isConfirmed = dto.estado === 'CONFIRMADA';
    await reservationsRepository.addDocument(r.id, isConfirmed ? 'CONFIRMACION' : 'TENTATIVA', { final: isConfirmed, snapshot: await buildDocSnapshot(branchId, fullNew) });
    void recordActivity(scope, {
      activity: 'RESERVATION_CREATE', area: 'RESERVAS', entityId: r.id, reference: `Reserva ${code}`,
      detail: `${dto.contacto.nombre ?? 'Cliente'} · ${dto.habitaciones.length} hab · ${dto.entradaAt.toLocaleString('es-PE')}`,
      meta: { reservationId: r.id, code, rooms: dto.habitaciones.length, estado: dto.estado },
    });
    return serialize((await reservationsRepository.findById(r.id))!);
  },

  async update(scope: RequestScope, id: string, dto: UpdateReservationDto) {
    const branchId = requireActiveBranch(scope);
    const existing = await this.getEntity(scope, id);
    await assertRefs(branchId, dto);
    await availabilityService.assertAssignedRoomsFree(scope, dto, id);
    const code = existing.code ?? (dto.codigo && /R-\d+/i.test(dto.codigo) ? dto.codigo : `R-${String((await reservationsRepository.maxCodeNumber(branchId)) + 1).padStart(4, '0')}`);
    const { input } = await buildInput(branchId, scope, dto, code);
    // No re-crear la reserva: reutilizar la cabecera con su id (updateFull borra hijos y reescribe).
    const { reservation, ...rest } = input;
    const headerUpdate: Prisma.ReservationUncheckedUpdateInput = { ...reservation, branchId: undefined, createdByUserId: undefined };
    await reservationsRepository.updateFull(id, headerUpdate, { reservation, ...rest });
    const fullUpd = (await reservationsRepository.findById(id))!;
    const isConfirmedUpd = dto.estado === 'CONFIRMADA';
    await reservationsRepository.addDocument(id, isConfirmedUpd ? 'CONFIRMACION' : 'TENTATIVA', { final: isConfirmedUpd, snapshot: await buildDocSnapshot(branchId, fullUpd) });
    void recordActivity(scope, {
      activity: 'RESERVATION_UPDATE', area: 'RESERVAS', entityId: id, reference: `Reserva ${code}`,
      detail: `Reserva modificada · ${dto.contacto.nombre ?? 'Cliente'}`,
      meta: { reservationId: id, code },
    });
    return serialize((await reservationsRepository.findById(id))!);
  },

  async cancel(scope: RequestScope, id: string, dto: { rooms?: string[]; motivo?: string | null }) {
    const existing = await this.getEntity(scope, id);
    const allRoomIds = existing.rooms.map((r) => r.id);
    const target = dto.rooms && dto.rooms.length ? dto.rooms.filter((x) => allRoomIds.includes(x)) : allRoomIds;
    const remaining = await reservationsRepository.cancelUnits(id, target);
    const data: Prisma.ReservationUncheckedUpdateInput = {};
    if (remaining === 0) data.status = 'CANCELLED';
    if (dto.motivo) data.notes = dto.motivo;
    const r = await reservationsRepository.patchHeader(id, data);
    const parcial = remaining > 0;
    void recordActivity(scope, {
      activity: 'RESERVATION_CANCEL', area: 'RESERVAS', entityId: id, reference: `Reserva ${r.code ?? id.slice(0, 6)}`,
      detail: parcial ? `Cancelación parcial (${target.length} hab)${dto.motivo ? ` · ${dto.motivo}` : ''}` : `Reserva cancelada${dto.motivo ? ` · ${dto.motivo}` : ''}`,
      meta: { reservationId: id, rooms: target.length, parcial },
    });
    return serialize(r);
  },

  async addPayment(scope: RequestScope, id: string, dto: AddPaymentDto) {
    const branchId = requireActiveBranch(scope);
    const existing = await this.getEntity(scope, id);
    const total = Number(existing.total ?? 0);
    const paid = Number(existing.paid ?? 0);
    const balance = total - paid;
    if (total > 0 && dto.importe > balance + 0.009) {
      throw new ConflictError(`El pago (S/ ${dto.importe.toFixed(2)}) excede el saldo pendiente (S/ ${balance.toFixed(2)}). No se permiten sobrepagos.`);
    }
    // ETAPA 3 (3B): el pago de reserva es dinero que entra. Con caja abierta se registra un
    // CashMovement IN y queda conciliado; sin caja abierta NO se bloquea: se registra el pago y
    // queda "pendiente de conciliar" (se regularizará cuando haya turno).
    const open = await cashRepository.findOpen(branchId);
    let cashMovementId: string | null = null;
    let cashSessionId: string | null = null;
    if (open) {
      const mov = await cashRepository.addMovement({
        cashSessionId: open.id,
        branchId,
        type: 'IN',
        amount: dto.importe,
        concept: `Reserva ${existing.code ?? id.slice(0, 6)} · ${existing.contactName ?? existing.guestName ?? 'Cliente'}`,
        method: dto.medio,
        reference: dto.operacion ?? null,
        note: dto.observacion ?? null,
        category: 'RESERVA',
        createdByUserId: scope.userId,
      });
      cashMovementId = mov.id;
      cashSessionId = open.id;
    }
    const r = await reservationsRepository.addPayment(id, {
      amount: dto.importe,
      method: dto.medio,
      destination: dto.destino ?? null,
      reference: dto.operacion ?? null,
      note: dto.observacion ?? null,
      kind: 'RECIBIDO',
      paidAt: dto.fecha ?? new Date(),
      createdByUserId: scope.userId,
      cashMovementId,
      cashSessionId,
      conciliated: !!open,
    });
    void recordActivity(scope, {
      activity: 'RESERVATION_UPDATE', area: 'RESERVAS', entityId: id, reference: `Reserva ${r.code ?? id.slice(0, 6)}`,
      detail: `Pago recibido S/ ${dto.importe.toFixed(2)} (${dto.medio})${open ? '' : ' · pendiente de conciliar (sin caja abierta)'}`,
      meta: { reservationId: id, amount: dto.importe, method: dto.medio, conciliated: !!open, cashSessionId },
    });
    return serialize(r);
  },

  async changeStatus(scope: RequestScope, id: string, dto: ChangeStatusDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    const status = STATUS_FROM_ESTADO[dto.estado];
    const data: Prisma.ReservationUncheckedUpdateInput = { status };
    if (dto.estado === 'CANCELADA' && dto.motivo) data.notes = dto.motivo;
    await reservationsRepository.patchHeader(id, data);
    if (dto.estado === 'CONFIRMADA') {
      const full = (await reservationsRepository.findById(id))!;
      await reservationsRepository.addDocument(id, 'CONFIRMACION', { final: true, snapshot: await buildDocSnapshot(branchId, full) });
    }
    const r = (await reservationsRepository.findById(id))!;
    void recordActivity(scope, {
      activity: dto.estado === 'CANCELADA' ? 'RESERVATION_CANCEL' : 'RESERVATION_UPDATE', area: 'RESERVAS', entityId: id,
      reference: `Reserva ${r.code ?? id.slice(0, 6)}`,
      detail: `Reserva → ${dto.estado}${dto.motivo ? ` · ${dto.motivo}` : ''}`,
      meta: { reservationId: id, estado: dto.estado },
    });
    return serialize(r);
  },

  async remove(scope: RequestScope, id: string) {
    const r = await this.getEntity(scope, id);
    const out = await reservationsRepository.delete(id);
    void recordActivity(scope, {
      activity: 'RESERVATION_CANCEL', area: 'RESERVAS', entityId: id, reference: `Reserva ${r.code ?? id.slice(0, 6)}`,
      detail: 'Reserva eliminada', meta: { reservationId: id },
    });
    return out;
  },
};
