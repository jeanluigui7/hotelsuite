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
import { purchasesRepository, type PurchaseWithRelations } from './purchases.repository';
import type { CreatePurchaseDto } from './purchases.schema';

const SORTABLE = ['createdAt', 'total'] as const;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function serialize(p: PurchaseWithRelations) {
  return {
    id: p.id,
    supplier: p.supplier,
    documentNumber: p.documentNumber,
    total: p.total,
    status: p.status,
    createdAt: p.createdAt,
    items: p.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      quantity: i.quantity,
      unitCost: i.unitCost,
      subtotal: i.subtotal,
    })),
  };
}

export const purchasesService = {
  async create(scope: RequestScope, dto: CreatePurchaseDto) {
    const branchId = requireActiveBranch(scope);

    const supplier = await prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || supplier.branchId !== branchId) throw new ValidationError('Proveedor inválido');
    const warehouse = await prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse || warehouse.branchId !== branchId) throw new ValidationError('Almacén inválido');

    const items = [];
    let total = 0;
    for (const item of dto.items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product || product.branchId !== branchId) throw new ValidationError('Producto inválido');
      const subtotal = round(item.unitCost * item.quantity);
      total = round(total + subtotal);
      items.push({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, subtotal });
    }

    const purchase = await purchasesRepository.create({
      branchId,
      supplierId: dto.supplierId,
      warehouseId: dto.warehouseId,
      documentNumber: dto.documentNumber || null,
      notes: dto.notes || null,
      total,
      createdByUserId: scope.userId,
      items,
    });
    return serialize(purchase);
  },

  async getById(scope: RequestScope, id: string) {
    const p = await purchasesRepository.findById(id);
    if (!p || p.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Ingreso no encontrado');
    return serialize(p);
  },

  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.PurchaseInvoiceWhereInput = { branchId };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      purchasesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'createdAt') }),
      purchasesRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },
};
