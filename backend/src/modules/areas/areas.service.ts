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
import { areasRepository, type AreaWithRelations } from './areas.repository';
import type { CreateAreaDto, UpdateAreaDto } from './areas.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

function serialize(a: AreaWithRelations, itemCount: number) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    managesFloors: a.managesFloors,
    warehouseId: a.warehouseId,
    warehouse: a.warehouse,
    itemCount,
    status: a.status,
  };
}

/** El almacén vinculado debe pertenecer a la sucursal. */
async function assertWarehouseInBranch(warehouseId: string | null | undefined, branchId: string): Promise<void> {
  if (!warehouseId) return;
  const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!wh || wh.branchId !== branchId) throw new ValidationError('Almacén inválido');
}

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
    // "Items" = cantidad de productos con stock en el almacén vinculado al área.
    const counts = await areasRepository.stockCountsByWarehouse(
      items.map((a) => a.warehouseId).filter((id): id is string => !!id),
    );
    return {
      items: items.map((a) => serialize(a, a.warehouseId ? (counts.get(a.warehouseId) ?? 0) : 0)),
      meta: pageMeta(params, total),
    };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await areasRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Área no encontrada');
    }
    return item;
  },

  async create(scope: RequestScope, dto: CreateAreaDto) {
    const branchId = requireActiveBranch(scope);
    await assertWarehouseInBranch(dto.warehouseId || null, branchId);
    return areasRepository.create({
      branchId,
      name: dto.name,
      description: dto.description || null,
      managesFloors: dto.managesFloors ?? false,
      warehouseId: dto.warehouseId || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateAreaDto) {
    const branchId = requireActiveBranch(scope);
    await this.getById(scope, id);
    await assertWarehouseInBranch(dto.warehouseId || null, branchId);
    return areasRepository.update(id, {
      name: dto.name,
      description: dto.description === '' ? null : dto.description,
      ...(dto.managesFloors !== undefined ? { managesFloors: dto.managesFloors } : {}),
      ...(dto.warehouseId !== undefined
        ? dto.warehouseId
          ? { warehouse: { connect: { id: dto.warehouseId } } }
          : { warehouse: { disconnect: true } }
        : {}),
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return areasRepository.delete(id);
  },
};
