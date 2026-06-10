import type { Prisma, Revision } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { revisionsRepository } from './revisions.repository';
import type { CreateRevisionDto, UpdateRevisionDto } from './revisions.schema';

async function roomMap(branchId: string) {
  const rooms = await prisma.room.findMany({ where: { branchId }, select: { id: true, number: true } });
  return new Map(rooms.map((r) => [r.id, r.number]));
}

function serialize(r: Revision, rooms: Map<string, string>) {
  return {
    id: r.id,
    roomId: r.roomId,
    roomNumber: rooms.get(r.roomId) ?? '—',
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt,
  };
}

async function assertRoom(roomId: string, branchId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
}

export const revisionsService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.RevisionWhereInput = { branchId };
    if (status) where.status = status;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      revisionsRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      revisionsRepository.count(where),
    ]);
    const rooms = await roomMap(branchId);
    return { items: rows.map((r) => serialize(r, rooms)), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const r = await revisionsRepository.findById(id);
    if (!r || r.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Revisión no encontrada');
    return r;
  },

  async create(scope: RequestScope, dto: CreateRevisionDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoom(dto.roomId, branchId);
    const r = await revisionsRepository.create({
      branchId,
      roomId: dto.roomId,
      notes: dto.notes || null,
      status: dto.status,
      createdByUserId: scope.userId,
    });
    return serialize(r, await roomMap(branchId));
  },

  async update(scope: RequestScope, id: string, dto: UpdateRevisionDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    if (dto.roomId) await assertRoom(dto.roomId, branchId);
    const r = await revisionsRepository.update(id, {
      roomId: dto.roomId,
      notes: dto.notes === '' ? null : dto.notes,
      status: dto.status,
    });
    return serialize(r, await roomMap(branchId));
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return revisionsRepository.delete(id);
  },
};
