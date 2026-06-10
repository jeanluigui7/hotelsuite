import type { Prisma, InventoryMovement } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { movementsRepository } from './movements.repository';
import type { AdjustDto, TransferDto } from './movements.schema';

async function assertProductAndWarehouse(productId: string, warehouseId: string, branchId: string) {
  const [product, warehouse] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.warehouse.findUnique({ where: { id: warehouseId } }),
  ]);
  if (!product || product.branchId !== branchId) throw new ValidationError('Producto inválido');
  if (!warehouse || warehouse.branchId !== branchId) throw new ValidationError('Almacén inválido');
  return product;
}

/** Enriches movements with product/warehouse names for display. */
async function enrich(branchId: string, rows: InventoryMovement[]) {
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ where: { branchId }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { branchId }, select: { id: true, name: true } }),
  ]);
  const pMap = new Map(products.map((p) => [p.id, p.name]));
  const wMap = new Map(warehouses.map((w) => [w.id, w.name]));
  return rows.map((m) => ({
    id: m.id,
    type: m.type,
    productName: pMap.get(m.productId) ?? '—',
    warehouseName: wMap.get(m.warehouseId) ?? '—',
    relatedWarehouseName: m.relatedWarehouseId ? (wMap.get(m.relatedWarehouseId) ?? null) : null,
    quantity: m.quantity,
    unitCost: m.unitCost,
    reference: m.reference,
    createdAt: m.createdAt,
  }));
}

export const movementsService = {
  async list(
    scope: RequestScope,
    params: PaginationParams,
    filters: { productId?: string; warehouseId?: string; type?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.InventoryMovementWhereInput = { branchId };
    if (filters.productId) where.productId = filters.productId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters.type) where.type = filters.type;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      movementsRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      movementsRepository.count(where),
    ]);
    return { items: await enrich(branchId, rows), meta: pageMeta(params, total) };
  },

  async adjust(scope: RequestScope, dto: AdjustDto) {
    const branchId = requireActiveBranch(scope);
    const product = await assertProductAndWarehouse(dto.productId, dto.warehouseId, branchId);
    try {
      return await movementsRepository.adjust({
        branchId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: 'ADJUST',
        quantity: dto.quantity,
        unitCost: product.cost ? Number(product.cost) : null,
        reference: dto.reference || 'Ajuste manual',
        createdByUserId: scope.userId,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'STOCK_INSUFFICIENT') {
        throw new ValidationError('El ajuste dejaría el stock en negativo');
      }
      throw err;
    }
  },

  async transfer(scope: RequestScope, dto: TransferDto) {
    const branchId = requireActiveBranch(scope);
    const product = await assertProductAndWarehouse(dto.productId, dto.fromWarehouseId, branchId);
    await assertProductAndWarehouse(dto.productId, dto.toWarehouseId, branchId);
    try {
      return await movementsRepository.transfer({
        branchId,
        productId: dto.productId,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        quantity: dto.quantity,
        unitCost: product.cost ? Number(product.cost) : null,
        reference: dto.reference || 'Transferencia',
        createdByUserId: scope.userId,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'STOCK_INSUFFICIENT') {
        throw new ValidationError('Stock insuficiente en el almacén de origen');
      }
      throw err;
    }
  },
};
