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
import { observationsRepository, type ObservationWithRelations } from './observations.repository';
import type { CreateObservationDto, UpdateObservationDto } from './observations.schema';

const SORTABLE = ['createdAt', 'status'] as const;

function serialize(o: ObservationWithRelations) {
  return {
    id: o.id,
    room: o.room,
    title: o.title,
    body: o.body,
    status: o.status,
    createdAt: o.createdAt,
  };
}

async function assertRoomInBranch(roomId: string | null | undefined, branchId: string): Promise<void> {
  if (!roomId) return;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
}

export const observationsService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ObservationWhereInput = { branchId };
    if (status) where.status = status;
    if (params.search) where.body = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      observationsRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'createdAt') }),
      observationsRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const o = await observationsRepository.findById(id);
    if (!o || o.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Observación no encontrada');
    return o;
  },

  async create(scope: RequestScope, dto: CreateObservationDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoomInBranch(dto.roomId, branchId);
    const o = await observationsRepository.create({
      branchId,
      roomId: dto.roomId ?? null,
      title: dto.title || null,
      body: dto.body,
      status: dto.status,
      createdByUserId: scope.userId,
    });
    return serialize(o);
  },

  async update(scope: RequestScope, id: string, dto: UpdateObservationDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertRoomInBranch(dto.roomId, branchId);
    const o = await observationsRepository.update(id, {
      roomId: dto.roomId === undefined ? undefined : dto.roomId,
      title: dto.title === '' ? null : dto.title,
      body: dto.body,
      status: dto.status,
    });
    return serialize(o);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return observationsRepository.delete(id);
  },
};
