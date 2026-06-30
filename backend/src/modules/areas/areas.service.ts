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
  const subWarehouses = a.subWarehouses.map((s) => ({ id: s.id, name: s.name, coverageType: s.coverageType, roomCount: s._count.rooms, status: s.status }));
  const totalCovered = subWarehouses.reduce((acc, s) => acc + s.roomCount, 0);
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    type: a.type,
    managesSubwarehouses: a.managesSubwarehouses,
    managesFloors: a.managesFloors,
    warehouseId: a.warehouseId,
    warehouse: a.warehouse,
    subWarehouses,
    coveredRooms: totalCovered,
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
    const area = await areasRepository.create({
      branchId,
      name: dto.name,
      description: dto.description || null,
      type: dto.type,
      managesSubwarehouses: dto.managesSubwarehouses ?? false,
      managesFloors: dto.managesFloors ?? false,
      warehouseId: dto.warehouseId || null,
      status: dto.status,
    });
    // Subalmacén inicial opcional (paso 1 del asistente). La cobertura se asigna en el paso 2.
    if (dto.managesSubwarehouses && dto.firstSubWarehouse) {
      await prisma.subWarehouse.create({
        data: { branchId, areaId: area.id, name: dto.firstSubWarehouse, coverageType: dto.coverageType ?? 'MANUAL' },
      });
    }
    return area;
  },

  async update(scope: RequestScope, id: string, dto: UpdateAreaDto) {
    const branchId = requireActiveBranch(scope);
    await this.getById(scope, id);
    await assertWarehouseInBranch(dto.warehouseId || null, branchId);
    return areasRepository.update(id, {
      name: dto.name,
      description: dto.description === '' ? null : dto.description,
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.managesSubwarehouses !== undefined ? { managesSubwarehouses: dto.managesSubwarehouses } : {}),
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
