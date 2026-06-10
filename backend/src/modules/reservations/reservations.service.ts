import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { reservationsRepository, type ReservationWithRelations } from './reservations.repository';
import type { CreateReservationDto, UpdateReservationDto } from './reservations.schema';

const SORTABLE = ['expectedCheckInAt', 'createdAt', 'status'] as const;

function serialize(r: ReservationWithRelations) {
  const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName ?? ''}`.trim() : r.guestName;
  return {
    id: r.id,
    roomType: r.roomType,
    room: r.room,
    guestId: r.guestId,
    guestName,
    phone: r.phone,
    expectedCheckInAt: r.expectedCheckInAt,
    durationMinutes: r.durationMinutes,
    adults: r.adults,
    children: r.children,
    status: r.status,
    notes: r.notes,
  };
}

async function assertRefsInBranch(
  branchId: string,
  roomTypeId: string | undefined,
  roomId: string | null | undefined,
): Promise<void> {
  if (roomTypeId) {
    const rt = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!rt || rt.branchId !== branchId) throw new ValidationError('Tipo de habitación inválido');
  }
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
  }
}

export const reservationsService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ReservationWhereInput = { branchId };
    if (status) where.status = status;
    if (params.search) {
      where.OR = [
        { guestName: { contains: params.search } },
        { guest: { firstName: { contains: params.search } } },
        { guest: { lastName: { contains: params.search } } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      reservationsRepository.list({
        where,
        skip,
        take,
        orderBy: buildOrderBy(params, SORTABLE, 'expectedCheckInAt'),
      }),
      reservationsRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const r = await reservationsRepository.findById(id);
    if (!r || r.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Reserva no encontrada');
    }
    return r;
  },

  async getById(scope: RequestScope, id: string) {
    return serialize(await this.getEntity(scope, id));
  },

  async create(scope: RequestScope, dto: CreateReservationDto) {
    const branchId = requireActiveBranch(scope);
    await assertRefsInBranch(branchId, dto.roomTypeId, dto.roomId);
    const r = await reservationsRepository.create({
      branchId,
      roomTypeId: dto.roomTypeId,
      roomId: dto.roomId ?? null,
      guestId: dto.guestId ?? null,
      guestName: dto.guestName || null,
      phone: dto.phone || null,
      expectedCheckInAt: dto.expectedCheckInAt,
      durationMinutes: dto.durationMinutes,
      adults: dto.adults,
      children: dto.children,
      status: dto.status,
      notes: dto.notes || null,
      createdByUserId: scope.userId,
    });
    return serialize(r);
  },

  async update(scope: RequestScope, id: string, dto: UpdateReservationDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertRefsInBranch(branchId, dto.roomTypeId, dto.roomId);
    const r = await reservationsRepository.update(id, {
      roomTypeId: dto.roomTypeId,
      roomId: dto.roomId === undefined ? undefined : dto.roomId,
      guestId: dto.guestId === undefined ? undefined : dto.guestId,
      guestName: dto.guestName === '' ? null : dto.guestName,
      phone: dto.phone === '' ? null : dto.phone,
      expectedCheckInAt: dto.expectedCheckInAt,
      durationMinutes: dto.durationMinutes,
      adults: dto.adults,
      children: dto.children,
      status: dto.status,
      notes: dto.notes === '' ? null : dto.notes,
    });
    return serialize(r);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return reservationsRepository.delete(id);
  },
};
