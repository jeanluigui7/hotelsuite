import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { cashRepository } from '../cash/cash.repository';
import { productsRepository } from '../products/products.repository';
import {
  salesRepository,
  type SaleLineInput,
  type SalePaymentInput,
  type SaleWithRelations,
} from './sales.repository';
import type { CreateSaleDto } from './sales.schema';

const SORTABLE = ['createdAt', 'total', 'status'] as const;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function serialize(sale: SaleWithRelations) {
  const paid = sale.payments.reduce((acc, p) => acc + Number(p.amount), 0);
  return {
    id: sale.id,
    stayId: sale.stayId,
    guestId: sale.guestId,
    customerName: sale.customerName,
    total: sale.total,
    paid: round(paid),
    status: sale.status,
    cashSessionId: sale.cashSessionId,
    createdAt: sale.createdAt,
    items: sale.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.subtotal,
    })),
    payments: sale.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
  };
}

export const salesService = {
  async create(scope: RequestScope, dto: CreateSaleDto) {
    const branchId = requireActiveBranch(scope);

    // Solo se exige turno de caja abierto cuando hay pagos que registrar. Una venta a
    // crédito (cargo sin pago, p. ej. el cargo de habitación al hacer check-in) puede
    // registrarse sin caja para no perder el rastro del cargo en el folio.
    const hasPayments = (dto.payments ?? []).some((p) => (p.amount ?? 0) > 0);
    const session = await cashRepository.findOpen(branchId);
    if (hasPayments && !session) throw new ConflictError('Debe abrir un turno de caja antes de registrar cobros');

    if (dto.stayId) {
      const stay = await prisma.stay.findUnique({ where: { id: dto.stayId } });
      if (!stay || stay.branchId !== branchId) throw new ValidationError('Estancia inválida');
    }
    if (dto.guestId) {
      const guest = await prisma.guest.findUnique({ where: { id: dto.guestId } });
      if (!guest) throw new ValidationError('Cliente inválido');
    }

    const wh = await productsRepository.defaultWarehouse(branchId);

    const lines: SaleLineInput[] = [];
    const stockDecrements: { productId: string; warehouseId: string; quantity: number; unitCost: number | null }[] = [];

    for (const item of dto.items) {
      if (item.productId) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product || product.branchId !== branchId) {
          throw new ValidationError('Producto inválido en la venta');
        }
        const unitPrice = item.unitPrice ?? Number(product.salePrice);
        const unitCost = product.cost != null ? Number(product.cost) : null;
        const subtotal = round(unitPrice * item.quantity);
        lines.push({
          productId: product.id,
          itemId: null,
          description: item.description || product.name,
          quantity: item.quantity,
          unitPrice,
          unitCost,
          subtotal,
        });
        stockDecrements.push({ productId: product.id, warehouseId: wh.id, quantity: item.quantity, unitCost });
      } else {
        const unitPrice = item.unitPrice ?? 0;
        lines.push({
          productId: null,
          itemId: null,
          description: item.description as string,
          quantity: item.quantity,
          unitPrice,
          unitCost: null,
          subtotal: round(unitPrice * item.quantity),
        });
      }
    }

    const total = round(lines.reduce((acc, l) => acc + l.subtotal, 0));
    const payments: SalePaymentInput[] = dto.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference || null,
    }));
    const paid = round(payments.reduce((acc, p) => acc + p.amount, 0));
    if (paid > total) throw new ValidationError('El pago excede el total de la venta');
    const status = total > 0 && paid >= total ? 'PAID' : 'OPEN';

    try {
      const sale = await salesRepository.create({
        branchId,
        stayId: dto.stayId ?? null,
        guestId: dto.guestId ?? null,
        customerName: dto.customerName || null,
        cashSessionId: session?.id ?? null,
        total,
        status,
        createdByUserId: scope.userId,
        items: lines,
        payments,
        stockDecrements,
      });
      return serialize(sale);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('STOCK_INSUFFICIENT')) {
        throw new ValidationError('Stock insuficiente para uno de los productos');
      }
      throw err;
    }
  },

  async getById(scope: RequestScope, id: string) {
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Venta no encontrada');
    return serialize(sale);
  },

  async list(
    scope: RequestScope,
    params: PaginationParams,
    filters: { status?: string; cashSessionId?: string; stayId?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.SaleWhereInput = { branchId };
    if (filters.status) where.status = filters.status;
    if (filters.cashSessionId) where.cashSessionId = filters.cashSessionId;
    if (filters.stayId) where.stayId = filters.stayId;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      salesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'createdAt') }),
      salesRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async cancel(scope: RequestScope, id: string) {
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Venta no encontrada');
    if (sale.status === 'CANCELLED') throw new ConflictError('La venta ya está anulada');
    return serialize(await salesRepository.cancel(id));
  },
};
