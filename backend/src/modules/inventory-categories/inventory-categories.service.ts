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
import { inventoryCategoriesRepository } from './inventory-categories.repository';
import type {
  CreateInventoryCategoryDto,
  UpdateInventoryCategoryDto,
} from './inventory-categories.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

export const inventoryCategoriesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.InventoryCategoryWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      inventoryCategoriesRepository.list({
        where,
        skip,
        take,
        orderBy: buildOrderBy(params, SORTABLE, 'name'),
      }),
      inventoryCategoriesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await inventoryCategoriesRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Categoría no encontrada');
    }
    return item;
  },

  create(scope: RequestScope, dto: CreateInventoryCategoryDto) {
    const branchId = requireActiveBranch(scope);
    return inventoryCategoriesRepository.create({
      branchId,
      name: dto.name,
      description: dto.description || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateInventoryCategoryDto) {
    await this.getById(scope, id);
    return inventoryCategoriesRepository.update(id, {
      name: dto.name,
      description: dto.description === '' ? null : dto.description,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return inventoryCategoriesRepository.delete(id);
  },
};
