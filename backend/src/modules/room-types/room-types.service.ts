import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { roomTypesRepository, type RoomTypeWithRelations } from './room-types.repository';
import type { CreateRoomTypeDto, UpdateRoomTypeDto } from './room-types.schema';

const SORTABLE = ['name', 'capacity', 'createdAt', 'status'] as const;

function serialize(rt: RoomTypeWithRelations) {
  return {
    id: rt.id,
    branchId: rt.branchId,
    name: rt.name,
    description: rt.description,
    capacity: rt.capacity,
    basePrice: rt.basePrice,
    status: rt.status,
    rateCount: rt._count.rates,
    attributeIds: rt.attributes.map((a) => a.attributeId),
    attributes: rt.attributes.map((a) => ({
      id: a.attribute.id,
      name: a.attribute.name,
      icon: a.attribute.icon,
    })),
  };
}

export const roomTypesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.RoomTypeWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };

    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      roomTypesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      roomTypesRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const rt = await roomTypesRepository.findById(id);
    if (!rt || rt.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Tipo de habitación no encontrado');
    }
    return rt;
  },

  async getById(scope: RequestScope, id: string) {
    return serialize(await this.getEntity(scope, id));
  },

  async create(scope: RequestScope, dto: CreateRoomTypeDto) {
    const branchId = requireActiveBranch(scope);
    const rt = await roomTypesRepository.create({
      branchId,
      name: dto.name,
      description: dto.description || null,
      capacity: dto.capacity,
      basePrice: dto.basePrice ?? null,
      status: dto.status,
      attributeIds: dto.attributeIds,
    });
    return serialize(rt);
  },

  async update(scope: RequestScope, id: string, dto: UpdateRoomTypeDto) {
    await this.getEntity(scope, id);
    const rt = await roomTypesRepository.update(id, {
      name: dto.name,
      description: dto.description === '' ? null : dto.description,
      capacity: dto.capacity,
      basePrice: dto.basePrice,
      status: dto.status,
      attributeIds: dto.attributeIds,
    });
    return serialize(rt as RoomTypeWithRelations);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return roomTypesRepository.delete(id);
  },
};
