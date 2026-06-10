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
import { roomAttributesRepository } from './room-attributes.repository';
import type { CreateRoomAttributeDto, UpdateRoomAttributeDto } from './room-attributes.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

export const roomAttributesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.RoomAttributeWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };

    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      roomAttributesRepository.list({
        where,
        skip,
        take,
        orderBy: buildOrderBy(params, SORTABLE, 'name'),
      }),
      roomAttributesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await roomAttributesRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Atributo no encontrado');
    }
    return item;
  },

  create(scope: RequestScope, dto: CreateRoomAttributeDto) {
    const branchId = requireActiveBranch(scope);
    return roomAttributesRepository.create({
      branchId,
      name: dto.name,
      icon: dto.icon || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateRoomAttributeDto) {
    await this.getById(scope, id);
    return roomAttributesRepository.update(id, {
      name: dto.name,
      icon: dto.icon === '' ? null : dto.icon,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return roomAttributesRepository.delete(id);
  },
};
