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
import { areasRepository } from './areas.repository';
import type { CreateAreaDto, UpdateAreaDto } from './areas.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

export const areasService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.AreaWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      areasRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      areasRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await areasRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Área no encontrada');
    }
    return item;
  },

  create(scope: RequestScope, dto: CreateAreaDto) {
    const branchId = requireActiveBranch(scope);
    return areasRepository.create({
      branchId,
      name: dto.name,
      description: dto.description || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateAreaDto) {
    await this.getById(scope, id);
    return areasRepository.update(id, {
      name: dto.name,
      description: dto.description === '' ? null : dto.description,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return areasRepository.delete(id);
  },
};
