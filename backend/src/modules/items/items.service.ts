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
import { itemsRepository } from './items.repository';
import { ITEM_KINDS, type CreateItemDto, type UpdateItemDto } from './items.schema';

const SORTABLE = ['name', 'kind', 'createdAt', 'status'] as const;

function isKind(value: unknown): value is (typeof ITEM_KINDS)[number] {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value);
}

export const itemsService = {
  async list(scope: RequestScope, params: PaginationParams, kind?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ItemWhereInput = { branchId };
    if (isKind(kind)) where.kind = kind;
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      itemsRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      itemsRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await itemsRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Item no encontrado');
    }
    return item;
  },

  create(scope: RequestScope, dto: CreateItemDto) {
    const branchId = requireActiveBranch(scope);
    return itemsRepository.create({
      branchId,
      kind: dto.kind,
      name: dto.name,
      description: dto.description || null,
      price: dto.price ?? null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateItemDto) {
    await this.getById(scope, id);
    return itemsRepository.update(id, {
      kind: dto.kind,
      name: dto.name,
      description: dto.description === '' ? null : dto.description,
      price: dto.price,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return itemsRepository.delete(id);
  },
};
