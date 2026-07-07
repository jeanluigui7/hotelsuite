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
import { prisma } from '../../config/prisma';
import { inventoryCategoriesRepository } from './inventory-categories.repository';
import type {
  CreateInventoryCategoryDto,
  UpdateInventoryCategoryDto,
} from './inventory-categories.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

/** Aplana los tamaños ({name}[]) a string[] en la respuesta. */
function serialize<T extends { sizes?: { name: string }[] }>(cat: T) {
  return { ...cat, sizes: (cat.sizes ?? []).map((s) => s.name) };
}

/** Sincroniza los tamaños de una categoría (solo si es Ropa; si no, los borra). */
async function syncSizes(categoryId: string, branchId: string, type: string | null | undefined, sizes: string[] | undefined): Promise<void> {
  if (type !== 'CLOTHING') { await prisma.categorySize.deleteMany({ where: { categoryId } }); return; }
  if (sizes === undefined) return; // no tocar si no vino la lista
  const wanted = [...new Set(sizes.map((s) => s.trim()).filter(Boolean))];
  const existing = await prisma.categorySize.findMany({ where: { categoryId }, select: { name: true } });
  const have = new Set(existing.map((e) => e.name));
  const toAdd = wanted.filter((s) => !have.has(s));
  const toRemove = [...have].filter((s) => !wanted.includes(s));
  if (toRemove.length) await prisma.categorySize.deleteMany({ where: { categoryId, name: { in: toRemove } } });
  if (toAdd.length) await prisma.categorySize.createMany({ data: toAdd.map((name) => ({ branchId, categoryId, name })) });
}

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
    return { items: items.map(serialize), meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await inventoryCategoriesRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Categoría no encontrada');
    }
    return serialize(item);
  },

  async create(scope: RequestScope, dto: CreateInventoryCategoryDto) {
    const branchId = requireActiveBranch(scope);
    const cat = await inventoryCategoriesRepository.create({
      branchId,
      name: dto.name,
      type: dto.type ?? null,
      description: dto.description || null,
      status: dto.status,
    });
    await syncSizes(cat.id, branchId, dto.type ?? null, dto.sizes);
    return this.getById(scope, cat.id);
  },

  async update(scope: RequestScope, id: string, dto: UpdateInventoryCategoryDto) {
    const current = await inventoryCategoriesRepository.findById(id);
    if (!current || current.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Categoría no encontrada');
    await inventoryCategoriesRepository.update(id, {
      name: dto.name,
      ...(dto.type !== undefined ? { type: dto.type ?? null } : {}),
      description: dto.description === '' ? null : dto.description,
      status: dto.status,
    });
    const effectiveType = dto.type !== undefined ? dto.type ?? null : current.type;
    await syncSizes(id, current.branchId, effectiveType, dto.sizes);
    return this.getById(scope, id);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return inventoryCategoriesRepository.delete(id);
  },
};
