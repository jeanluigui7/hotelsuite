import { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { ratesRepository } from './rates.repository';
import { roomTypesRepository } from '../room-types/room-types.repository';
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
    try {
      return await ratesRepository.createRate({ branchId, ...dto });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Ya existe una tarifa con esa duración para el tipo de habitación');
      }
      throw err;
    }
  },

  async updateRate(scope: RequestScope, id: string, dto: UpdateRateDto) {
    const branchId = requireActiveBranch(scope);
    const existing = await ratesRepository.findRate(id);
    if (!existing || existing.branchId !== branchId) throw new NotFoundError('Tarifa no encontrada');
    if (dto.roomTypeId) await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    try {
      return await ratesRepository.updateRate(id, dto);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Ya existe una tarifa con esa duración para el tipo de habitación');
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
    return ratesRepository.updateCustomRate(id, {
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
