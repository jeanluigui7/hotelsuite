import { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { ratesRepository, type IncludedServiceRow } from './rates.repository';
import { roomTypesRepository } from '../room-types/room-types.repository';
import { recordActivity } from '../activity-log/activity.emitter';
import type {
  CreateCustomRateDto,
  CreateRateDto,
  UpdateCustomRateDto,
  UpdateRateDto,
} from './rates.schema';

async function assertRoomTypeInBranch(roomTypeId: string, branchId: string): Promise<void> {
  const rt = await roomTypesRepository.findById(roomTypeId);
  if (!rt || rt.branchId !== branchId) {
    throw new ValidationError('El tipo de habitación no pertenece a la sucursal');
  }
}

/** Valida que los conceptos existan en la sucursal y devuelve las filas listas para persistir. */
async function buildIncludedRows(
  branchId: string,
  included: NonNullable<CreateRateDto['includedServices']> | undefined,
): Promise<IncludedServiceRow[] | undefined> {
  if (included === undefined) return undefined; // no tocar la lista
  if (included.length === 0) return [];
  const ids = [...new Set(included.map((s) => s.conceptId))];
  const concepts = await prisma.serviceConcept.findMany({ where: { id: { in: ids }, branchId }, select: { id: true } });
  const ok = new Set(concepts.map((c) => c.id));
  for (const s of included) {
    if (!ok.has(s.conceptId)) throw new ValidationError('Un servicio incluido no pertenece a la sucursal o no existe');
  }
  return included.map((s, i) => ({
    branchId,
    conceptId: s.conceptId,
    quantity: s.quantity,
    assignment: s.assignment,
    frequency: s.frequency,
    availability: s.availability,
    scheduleFrom: s.scheduleFrom ?? null,
    scheduleTo: s.scheduleTo ?? null,
    place: s.place,
    sortOrder: i,
  }));
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export const ratesService = {
  // ── Base rates ──
  async listRates(scope: RequestScope, roomTypeId?: string) {
    const branchId = requireActiveBranch(scope);
    return ratesRepository.listRates({ branchId, ...(roomTypeId ? { roomTypeId } : {}) });
  },

  async createRate(scope: RequestScope, dto: CreateRateDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    const { includedServices, ...rate } = dto;
    const included = await buildIncludedRows(branchId, includedServices);
    try {
      return await ratesRepository.createRate({ branchId, ...rate }, included);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Ya existe una tarifa con esa etiqueta y duración para el tipo de habitación');
      }
      throw err;
    }
  },

  async updateRate(scope: RequestScope, id: string, dto: UpdateRateDto) {
    const branchId = requireActiveBranch(scope);
    const existing = await ratesRepository.findRate(id);
    if (!existing || existing.branchId !== branchId) throw new NotFoundError('Tarifa no encontrada');
    if (dto.roomTypeId) await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    const { includedServices, ...rate } = dto;
    const included = await buildIncludedRows(branchId, includedServices);
    try {
      const updated = await ratesRepository.updateRate(id, rate, included);
      if (!updated) throw new NotFoundError('Tarifa no encontrada');
      if (dto.price !== undefined && Number(existing.price) !== Number(updated.price)) {
        void recordActivity(scope, {
          activity: 'PRICE_CHANGE', area: 'PRECIOS', entityId: id, reference: `Tarifa ${updated.label}`,
          detail: `Tarifa modificada · ${updated.label} · S/ ${Number(existing.price).toFixed(2)} → S/ ${Number(updated.price).toFixed(2)}`,
          meta: { entity: 'Tarifa', label: updated.label, before: Number(existing.price), after: Number(updated.price) },
        });
      }
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Ya existe una tarifa con esa etiqueta y duración para el tipo de habitación');
      }
      throw err;
    }
  },

  async removeRate(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const existing = await ratesRepository.findRate(id);
    if (!existing || existing.branchId !== branchId) throw new NotFoundError('Tarifa no encontrada');
    // La tarifa puede estar referenciada por estancias (historial). Se desvincula primero
    // (el precio queda congelado en la estancia) para no violar la FK y evitar el 500.
    return ratesRepository.deleteRate(id);
  },

  // ── Custom rates ──
  async listCustomRates(scope: RequestScope, roomTypeId?: string) {
    const branchId = requireActiveBranch(scope);
    return ratesRepository.listCustomRates({ branchId, ...(roomTypeId ? { roomTypeId } : {}) });
  },

  async createCustomRate(scope: RequestScope, dto: CreateCustomRateDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    return ratesRepository.createCustomRate({
      branchId,
      roomTypeId: dto.roomTypeId,
      tierId: dto.tierId ?? null,
      label: dto.label,
      durationMinutes: dto.durationMinutes,
      price: dto.price,
      validFrom: dto.validFrom ?? null,
      validTo: dto.validTo ?? null,
      status: dto.status,
    });
  },

  async updateCustomRate(scope: RequestScope, id: string, dto: UpdateCustomRateDto) {
    const branchId = requireActiveBranch(scope);
    const existing = await ratesRepository.findCustomRate(id);
    if (!existing || existing.branchId !== branchId) {
      throw new NotFoundError('Tarifa personalizada no encontrada');
    }
    if (dto.roomTypeId) await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    const updated = await ratesRepository.updateCustomRate(id, {
      label: dto.label,
      durationMinutes: dto.durationMinutes,
      price: dto.price,
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      status: dto.status,
      ...(dto.roomTypeId ? { roomType: { connect: { id: dto.roomTypeId } } } : {}),
      ...(dto.tierId !== undefined
        ? dto.tierId
          ? { tier: { connect: { id: dto.tierId } } }
          : { tier: { disconnect: true } }
        : {}),
    });
    if (dto.price !== undefined && Number(existing.price) !== Number(updated.price)) {
      void recordActivity(scope, {
        activity: 'PRICE_CHANGE', area: 'PRECIOS', entityId: id, reference: `Tarifa ${updated.label}`,
        detail: `Tarifa personalizada modificada · ${updated.label} · S/ ${Number(existing.price).toFixed(2)} → S/ ${Number(updated.price).toFixed(2)}`,
        meta: { entity: 'Tarifa personalizada', label: updated.label, before: Number(existing.price), after: Number(updated.price) },
      });
    }
    return updated;
  },

  async removeCustomRate(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const existing = await ratesRepository.findCustomRate(id);
    if (!existing || existing.branchId !== branchId) {
      throw new NotFoundError('Tarifa personalizada no encontrada');
    }
    return ratesRepository.deleteCustomRate(id);
  },
};
