import { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { roomsRepository, type RoomForMap } from './rooms.repository';
import { roomTypesRepository } from '../room-types/room-types.repository';
import type { ChangeRoomStatusDto, CreateRoomDto, UpdateRoomDto } from './rooms.schema';

async function assertRoomTypeInBranch(roomTypeId: string, branchId: string): Promise<void> {
  const rt = await roomTypesRepository.findById(roomTypeId);
  if (!rt || rt.branchId !== branchId) {
    throw new ValidationError('El tipo de habitación no pertenece a la sucursal');
  }
}

function serializeMap(room: RoomForMap) {
  const stay = room.stays[0];
  return {
    id: room.id,
    number: room.number,
    floor: room.floor,
    status: room.status,
    roomType: room.roomType,
    notes: room.notes,
    activeStay: stay
      ? {
          id: stay.id,
          guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ''}`.trim(),
          checkInAt: stay.checkInAt,
          plannedCheckoutAt: stay.plannedCheckoutAt,
          priceAgreed: stay.priceAgreed,
          balanceDue: stay.balanceDue,
        }
      : null,
  };
}

export const roomsService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.RoomWhereInput = { branchId };
    if (params.search) where.number = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      roomsRepository.list({ where, skip, take, orderBy: [{ floor: 'asc' }, { number: 'asc' }] }),
      roomsRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async map(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rooms = await roomsRepository.map(branchId);
    // Pendiente por estancia = recargos (balanceDue) + ventas OPEN no pagadas.
    const stayIds = rooms.map((r) => r.stays[0]?.id).filter((id): id is string => !!id);
    const sales = stayIds.length
      ? await prisma.sale.findMany({ where: { stayId: { in: stayIds }, status: { not: 'CANCELLED' } }, include: { payments: true } })
      : [];
    const salesPending = new Map<string, number>();
    for (const s of sales) {
      if (!s.stayId) continue;
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      const owed = Number(s.total) - paid;
      if (owed > 0) salesPending.set(s.stayId, (salesPending.get(s.stayId) ?? 0) + owed);
    }
    return rooms.map((r) => {
      const m = serializeMap(r);
      if (m.activeStay) {
        const bd = m.activeStay.balanceDue ? Number(m.activeStay.balanceDue) : 0;
        const sp = salesPending.get(m.activeStay.id) ?? 0;
        return { ...m, activeStay: { ...m.activeStay, pending: Math.round((bd + sp) * 100) / 100 } };
      }
      return m;
    });
  },

  async getEntity(scope: RequestScope, id: string) {
    const room = await roomsRepository.findById(id);
    if (!room || room.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Habitación no encontrada');
    }
    return room;
  },

  async create(scope: RequestScope, dto: CreateRoomDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    try {
      return await roomsRepository.create({
        branchId,
        roomTypeId: dto.roomTypeId,
        number: dto.number,
        floor: dto.floor || null,
        notes: dto.notes || null,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Ya existe una habitación con ese número en la sucursal');
      }
      throw err;
    }
  },

  async update(scope: RequestScope, id: string, dto: UpdateRoomDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    if (dto.roomTypeId) await assertRoomTypeInBranch(dto.roomTypeId, branchId);
    try {
      return await roomsRepository.update(id, {
        number: dto.number,
        floor: dto.floor === '' ? null : dto.floor,
        notes: dto.notes === '' ? null : dto.notes,
        ...(dto.roomTypeId ? { roomType: { connect: { id: dto.roomTypeId } } } : {}),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Ya existe una habitación con ese número en la sucursal');
      }
      throw err;
    }
  },

  async changeStatus(scope: RequestScope, id: string, dto: ChangeRoomStatusDto) {
    const room = await this.getEntity(scope, id);
    if (room.status === 'OCCUPIED') {
      throw new ValidationError('No se puede cambiar manualmente el estado de una habitación ocupada; realice el check-out');
    }
    return roomsRepository.updateStatus(id, dto.status);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    const stays = await roomsRepository.countStays(id);
    if (stays > 0) {
      throw new ValidationError('No se puede eliminar una habitación con estancias registradas');
    }
    return roomsRepository.delete(id);
  },
};
