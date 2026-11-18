import type { Advance } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { recordActivity } from '../activity-log/activity.emitter';
import { reservationsRepository } from '../reservations/reservations.repository';
import { advancesRepository } from './advances.repository';
import type { ApplyAdvanceDto, CreateAdvanceDto } from './advances.schema';

function serialize(a: Advance) {
  const amount = Number(a.amount);
  const applied = Number(a.applied);
  return {
    id: a.id,
    codigo: a.code ?? `A-${a.id.slice(0, 6)}`,
    cliente: a.clientName,
    telefono: a.phone ?? undefined,
    fecha: a.createdAt.toISOString(),
    recibido: amount,
    aplicado: applied,
    disponible: Math.max(0, amount - applied),
    estado: a.status,
    origin: 'REAL' as const,
  };
}

export const advancesService = {
  async list(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rows = await advancesRepository.list(branchId);
    return rows.map(serialize);
  },

  async create(scope: RequestScope, dto: CreateAdvanceDto) {
    const branchId = requireActiveBranch(scope);
    const code = `A-${String((await advancesRepository.maxCodeNumber(branchId)) + 1).padStart(4, '0')}`;
    const a = await advancesRepository.create({
      branchId,
      code,
      clientName: dto.cliente,
      phone: dto.telefono ?? null,
      amount: dto.importe,
      applied: 0,
      status: 'POR_APLICAR',
      method: dto.medio ?? null,
      destination: dto.destino ?? null,
      reference: dto.operacion ?? null,
      note: dto.observacion ?? null,
      createdByUserId: scope.userId,
      createdAt: dto.fecha ?? new Date(),
    });
    void recordActivity(scope, {
      activity: 'RESERVATION_CREATE', area: 'RESERVAS', entityId: a.id, reference: `Anticipo ${code}`,
      detail: `Anticipo de ${dto.cliente} · S/ ${dto.importe.toFixed(2)}`,
      meta: { advanceId: a.id, amount: dto.importe },
    });
    return serialize(a);
  },

  /** Aplica parte de un anticipo a una reserva: crea un pago ANTICIPO_APLICADO (sin segundo ingreso en caja). */
  async apply(scope: RequestScope, advanceId: string, dto: ApplyAdvanceDto) {
    const branchId = requireActiveBranch(scope);
    const adv = await advancesRepository.findById(advanceId);
    if (!adv || adv.branchId !== branchId) throw new NotFoundError('Anticipo no encontrado');
    const available = Number(adv.amount) - Number(adv.applied);
    if (dto.importe <= 0) throw new ValidationError('Importe inválido');
    if (dto.importe > available + 0.009) throw new ConflictError(`Anticipo insuficiente (disponible S/ ${available.toFixed(2)}).`);

    const resv = await reservationsRepository.findById(dto.reservationId);
    if (!resv || resv.branchId !== branchId) throw new NotFoundError('Reserva no encontrada');
    const balance = Number(resv.total ?? 0) - Number(resv.paid ?? 0);
    if (Number(resv.total ?? 0) > 0 && dto.importe > balance + 0.009) {
      throw new ConflictError(`El importe excede el saldo de la reserva (S/ ${balance.toFixed(2)}).`);
    }

    await reservationsRepository.addPayment(dto.reservationId, {
      amount: dto.importe,
      method: 'Anticipo',
      kind: 'ANTICIPO_APLICADO',
      advanceId,
      paidAt: new Date(),
      createdByUserId: scope.userId,
    });
    const updated = await advancesRepository.applyAmount(advanceId, dto.importe);
    void recordActivity(scope, {
      activity: 'RESERVATION_UPDATE', area: 'RESERVAS', entityId: advanceId, reference: `Anticipo ${adv.code ?? advanceId.slice(0, 6)}`,
      detail: `Aplicado S/ ${dto.importe.toFixed(2)} a reserva ${resv.code ?? dto.reservationId.slice(0, 6)}`,
      meta: { advanceId, reservationId: dto.reservationId, amount: dto.importe },
    });
    return serialize(updated);
  },
};
