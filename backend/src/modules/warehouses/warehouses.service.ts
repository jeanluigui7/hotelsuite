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
import { warehousesRepository } from './warehouses.repository';
import type { CreateWarehouseDto, UpdateWarehouseDto } from './warehouses.schema';

const SORTABLE = ['name', 'type', 'createdAt'] as const;

export const warehousesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.WarehouseWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      warehousesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      warehousesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await warehousesRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Almacén no encontrado');
    return item;
  },

  create(scope: RequestScope, dto: CreateWarehouseDto) {
    const branchId = requireActiveBranch(scope);
    return warehousesRepository.create({ branchId, ...dto });
  },

  async update(scope: RequestScope, id: string, dto: UpdateWarehouseDto) {
    await this.getById(scope, id);
    return warehousesRepository.update(id, dto);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    const stock = await warehousesRepository.countStock(id);
    if (stock > 0) throw new ValidationError('No se puede eliminar un almacén con stock registrado');
    return warehousesRepository.delete(id);
  },

  /** Stock actual (productos + cantidad) de un almacén. */
  async stock(scope: RequestScope, id: string) {
    const warehouse = await this.getById(scope, id);
    const rows = await warehousesRepository.stockWithProducts(id);
    return {
      warehouse: { id: warehouse.id, name: warehouse.name, type: warehouse.type },
      items: rows.map((s) => ({
        productId: s.product.id,
        name: s.product.name,
        sku: s.product.sku,
        quantity: s.quantity,
        reorderPoint: s.product.reorderPoint,
        belowReorder: s.quantity <= s.product.reorderPoint,
      })),
    };
  },
};
