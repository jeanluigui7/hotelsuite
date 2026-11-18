import type { Proforma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { recordActivity } from '../activity-log/activity.emitter';
import { proformasRepository } from './proformas.repository';
import type { ConvertProformaDto, CreateProformaDto } from './proformas.schema';

function serialize(p: Proforma) {
  return {
    id: p.id,
    codigo: p.code ?? `P-${p.id.slice(0, 6)}`,
    cliente: p.clientName,
    telefono: p.phone ?? undefined,
    fecha: p.createdAt.toISOString(),
    validezAt: p.validUntil ? p.validUntil.toISOString() : '',
    habitaciones: p.rooms,
    total: p.total == null ? null : Number(p.total),
    estado: p.status,
    origin: 'REAL' as const,
  };
}

export const proformasService = {
  async list(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    await proformasRepository.expirePast(branchId);
    const rows = await proformasRepository.list(branchId);
    return rows.map(serialize);
  },

  async create(scope: RequestScope, dto: CreateProformaDto) {
    const branchId = requireActiveBranch(scope);
    const code = `P-${String((await proformasRepository.maxCodeNumber(branchId)) + 1).padStart(4, '0')}`;
    const validUntil = new Date(Date.now() + dto.validezDias * 86400000);
    const p = await proformasRepository.create({
      branchId,
      code,
      clientName: dto.cliente,
      phone: dto.telefono ?? null,
      rooms: dto.habitaciones,
      total: dto.total ?? null,
      validUntil,
      status: 'VIGENTE',
      createdByUserId: scope.userId,
    });
    void recordActivity(scope, {
      activity: 'RESERVATION_CREATE', area: 'RESERVAS', entityId: p.id, reference: `Proforma ${code}`,
      detail: `Cotización de ${dto.cliente} · ${dto.habitaciones} hab`,
      meta: { proformaId: p.id, rooms: dto.habitaciones },
    });
    return serialize(p);
  },

  async convert(scope: RequestScope, id: string, dto: ConvertProformaDto) {
    const branchId = requireActiveBranch(scope);
    const p = await proformasRepository.findById(id);
    if (!p || p.branchId !== branchId) throw new NotFoundError('Proforma no encontrada');
    if (p.status === 'CONVERTIDA') throw new ConflictError('La proforma ya fue convertida.');
    const updated = await proformasRepository.update(id, { status: 'CONVERTIDA', convertedReservationId: dto.reservationId });
    void recordActivity(scope, {
      activity: 'RESERVATION_UPDATE', area: 'RESERVAS', entityId: id, reference: `Proforma ${p.code ?? id.slice(0, 6)}`,
      detail: 'Proforma convertida en reserva', meta: { proformaId: id, reservationId: dto.reservationId },
    });
    return serialize(updated);
  },
};
