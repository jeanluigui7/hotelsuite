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
import { conciergeRepository, type ConciergeWithRelations } from './concierge.repository';
import type { CreateConciergeDto, UpdateConciergeDto } from './concierge.schema';

const SORTABLE = ['createdAt', 'status'] as const;

function serialize(c: ConciergeWithRelations) {
  return {
    id: c.id,
    room: c.room,
    guestName: c.guestName,
    category: c.category,
    description: c.description,
    status: c.status,
    createdAt: c.createdAt,
  };
}

async function assertRoomInBranch(roomId: string | null | undefined, branchId: string): Promise<void> {
  if (!roomId) return;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
}

export const conciergeService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ConciergeRequestWhereInput = { branchId };
    if (status) where.status = status;
    if (params.search) where.description = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      conciergeRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'createdAt') }),
      conciergeRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const c = await conciergeRepository.findById(id);
    if (!c || c.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Solicitud no encontrada');
    return c;
  },

  async create(scope: RequestScope, dto: CreateConciergeDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoomInBranch(dto.roomId, branchId);
    const c = await conciergeRepository.create({
      branchId,
      roomId: dto.roomId ?? null,
      guestName: dto.guestName || null,
      category: dto.category || null,
      description: dto.description,
      status: dto.status,
      createdByUserId: scope.userId,
    });
    return serialize(c);
  },

  async update(scope: RequestScope, id: string, dto: UpdateConciergeDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertRoomInBranch(dto.roomId, branchId);
    const c = await conciergeRepository.update(id, {
      roomId: dto.roomId === undefined ? undefined : dto.roomId,
      guestName: dto.guestName === '' ? null : dto.guestName,
      category: dto.category === '' ? null : dto.category,
      description: dto.description,
      status: dto.status,
    });
    return serialize(c);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return conciergeRepository.delete(id);
  },
};
