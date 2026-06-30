import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = {
  warehouse: { select: { id: true, name: true, type: true } },
  subWarehouses: { include: { _count: { select: { rooms: true } } } },
} satisfies Prisma.AreaInclude;
export type AreaWithRelations = Prisma.AreaGetPayload<{ include: typeof include }>;

export const areasRepository = {
  list(args: {
    where: Prisma.AreaWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.AreaOrderByWithRelationInput;
  }) {
    return prisma.area.findMany({ ...args, include });
  },
  count(where: Prisma.AreaWhereInput) {
    return prisma.area.count({ where });
  },
  findById(id: string) {
    return prisma.area.findUnique({ where: { id }, include });
  },
  /** Conteo de productos (stock rows) por almacén para los almacenes indicados. */
  async stockCountsByWarehouse(warehouseIds: string[]) {
    if (!warehouseIds.length) return new Map<string, number>();
    const rows = await prisma.stock.groupBy({
      by: ['warehouseId'],
      where: { warehouseId: { in: warehouseIds } },
      _count: { productId: true },
    });
    return new Map(rows.map((r) => [r.warehouseId, r._count.productId]));
  },
  create(data: Prisma.AreaUncheckedCreateInput) {
    return prisma.area.create({ data });
  },
  update(id: string, data: Prisma.AreaUpdateInput) {
    return prisma.area.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.area.delete({ where: { id } });
  },
};
