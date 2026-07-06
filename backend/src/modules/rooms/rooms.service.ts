import { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { roomsRepository, type RoomForMap } from './rooms.repository';
import { roomTypesRepository } from '../room-types/room-types.repository';
import { subWarehousesService } from '../subwarehouses/subwarehouses.service';
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
    tower: room.tower,
    status: room.status,
    roomType: { id: room.roomType.id, name: room.roomType.name },
    attributes: room.roomType.attributes.map((a) => ({ name: a.attribute.name, icon: a.attribute.icon })),
    notes: room.notes,
    imageUrl: room.imageUrl,
    frigobarEnabled: room.frigobarEnabled,
    activeStay: stay
      ? {
          id: stay.id,
          guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ''}`.trim(),
          documentNumber: stay.guest.documentNumber,
          phone: stay.guest.phone,
          guestCount: 1 + (stay._count?.additionalGuests ?? 0),
          checkInAt: stay.checkInAt,
          plannedCheckoutAt: stay.plannedCheckoutAt,
          durationMinutes: stay.durationMinutes,
          priceAgreed: stay.priceAgreed,
          balanceDue: stay.balanceDue,
          vehiclePlate: stay.vehiclePlate,
          renewed: !!stay.renewedAt,
          renewalCount: stay.renewalCount,
          cleaningRequested: stay.cleaningRequested,
          renewalCleaningStatus: stay.renewalCleaningStatus,
          renewalCleaningStep: stay.renewalCleaningStep,
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
    // Total de pasos de la limpieza de renovación (= ítems del checklist activos).
    const cleaningTotal = Math.max(1, await prisma.checklistItem.count({ where: { branchId, status: 'active' } }));
    // Pendiente por estancia = recargos (balanceDue) + ventas OPEN no pagadas.
    const stayIds = rooms.map((r) => r.stays[0]?.id).filter((id): id is string => !!id);
    const sales = stayIds.length
      ? await prisma.sale.findMany({ where: { stayId: { in: stayIds }, status: { not: 'CANCELLED' } }, include: { payments: true, items: true } })
      : [];
    const salesPending = new Map<string, number>();
    const consumos = new Map<string, number>();
    // El cargo base de la habitación ("Tarifa: …") ya se muestra como priceAgreed;
    // se excluye de "consumos" para no duplicarlo en el total del card.
    const isBaseRoom = (desc: string) => /^tarifa[:\s]/i.test(desc);
    for (const s of sales) {
      if (!s.stayId) continue;
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      const owed = Number(s.total) - paid;
      if (owed > 0) salesPending.set(s.stayId, (salesPending.get(s.stayId) ?? 0) + owed);
      const extras = s.items.filter((it) => !isBaseRoom(it.description)).reduce((a, it) => a + Number(it.subtotal), 0);
      consumos.set(s.stayId, (consumos.get(s.stayId) ?? 0) + extras);
    }
    return rooms.map((r) => {
      const m = serializeMap(r);
      if (m.activeStay) {
        const bd = m.activeStay.balanceDue ? Number(m.activeStay.balanceDue) : 0;
        const sp = salesPending.get(m.activeStay.id) ?? 0;
        const cons = Math.round((consumos.get(m.activeStay.id) ?? 0) * 100) / 100;
        return { ...m, activeStay: { ...m.activeStay, pending: Math.round((bd + sp) * 100) / 100, consumosTotal: cons, renewalCleaningTotal: cleaningTotal } };
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
      const room = await roomsRepository.create({
        branchId,
        roomTypeId: dto.roomTypeId,
        number: dto.number,
        floor: dto.floor || null,
        tower: dto.tower || null,
        notes: dto.notes || null,
        imageUrl: dto.imageUrl || null,
        frigobarEnabled: dto.frigobarEnabled ?? false,
      });
      if (dto.subWarehouseId !== undefined) await subWarehousesService.assignRoom(scope, room.id, dto.subWarehouseId);
      return room;
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
      const room = await roomsRepository.update(id, {
        number: dto.number,
        floor: dto.floor === '' ? null : dto.floor,
        ...(dto.tower !== undefined ? { tower: dto.tower === '' ? null : dto.tower } : {}),
        notes: dto.notes === '' ? null : dto.notes,
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl === '' ? null : dto.imageUrl } : {}),
        ...(dto.frigobarEnabled !== undefined ? { frigobarEnabled: dto.frigobarEnabled } : {}),
        ...(dto.roomTypeId ? { roomType: { connect: { id: dto.roomTypeId } } } : {}),
      });
      if (dto.subWarehouseId !== undefined) await subWarehousesService.assignRoom(scope, id, dto.subWarehouseId);
      return room;
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
