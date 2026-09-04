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
import { changeCreditsService } from '../change-credits/change-credits.service';
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

    // Toda venta (con o sin pago, incluido el cargo a crédito) requiere un turno de caja abierto.
    // Sin caja, recepción solo puede verificar/visualizar; para operar con dinero debe abrir caja.
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('Debes abrir caja para registrar ventas o cargos. Sin caja abierta solo puedes verificar y visualizar.');

    if (dto.stayId) {
      const stay = await prisma.stay.findUnique({ where: { id: dto.stayId } });
      if (!stay || stay.branchId !== branchId) throw new ValidationError('Estancia inválida');
    }
    if (dto.guestId) {
      const guest = await prisma.guest.findUnique({ where: { id: dto.guestId } });
      if (!guest) throw new ValidationError('Cliente inválido');
    }

    // Almacén de origen del stock: por defecto el general (PRODUCTS); si la venta es
    // de recepción/frigobar, descuenta del almacén de esa área (se crea si no existe).
    let wh = await productsRepository.defaultWarehouse(branchId);
    if (dto.sourceArea === 'RECEPTION' || dto.sourceArea === 'FRIGOBAR') {
      const areaName = dto.sourceArea === 'RECEPTION' ? 'Recepción' : 'Almacén Frigobar';
      let areaWh = await prisma.warehouse.findFirst({ where: { branchId, type: dto.sourceArea } });
      if (!areaWh) areaWh = await prisma.warehouse.create({ data: { branchId, name: areaName, type: dto.sourceArea } });
      wh = areaWh;
    }

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

    const goodsTotal = round(lines.reduce((acc, l) => acc + l.subtotal, 0));

    // La comisión POS (5% de tarjeta) NO es ingreso del negocio: la retiene el proveedor. Solo se
    // muestra en pantalla al cobrar (para saber cuánto cargar en el POS). El sistema registra el
    // pago NETO tal como lo envía el frontend, sin sumar la comisión ni crear una línea "Comisión POS".
    const payments: SalePaymentInput[] = dto.payments.map((p) => ({ method: p.method, amount: round(p.amount), reference: p.reference || null }));

    const total = round(goodsTotal);
    const paid = round(payments.reduce((acc, p) => acc + p.amount, 0));
    if (paid > total) throw new ValidationError('El pago excede el total de la venta');
    const status = total > 0 && paid >= total ? 'PAID' : 'OPEN';

    // Pago con VUELTO (saldo de vuelto de la estancia): no ingresa efectivo nuevo. Se valida contra el
    // saldo pendiente ANTES de crear la venta, y se consume DESPUÉS (marca CONSUMIDO al llegar a 0).
    const vueltoUsed = round(payments.filter((p) => p.method === 'VUELTO').reduce((a, p) => a + p.amount, 0));
    if (vueltoUsed > 0) {
      if (!dto.stayId) throw new ValidationError('El pago con Vuelto requiere una estancia.');
      const remaining = await changeCreditsService.remainingForStay(branchId, dto.stayId);
      if (vueltoUsed > remaining + 0.001) throw new ValidationError(`El vuelto disponible (S/ ${remaining.toFixed(2)}) no cubre el monto (S/ ${vueltoUsed.toFixed(2)}).`);
    }

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
      if (vueltoUsed > 0 && dto.stayId) await changeCreditsService.consumeForStay(branchId, dto.stayId, vueltoUsed);
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

  async cancel(scope: RequestScope, id: string, reason?: string) {
    const branchId = requireActiveBranch(scope);
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== branchId) throw new NotFoundError('Venta no encontrada');
    if (sale.status === 'CANCELLED') throw new ConflictError('La venta ya está anulada');
    const result = serialize(await salesRepository.cancel(id));
    // Huella de auditoría: anular una venta ya cerrada marca su caja como AJUSTADA.
    if (sale.cashSessionId) {
      await cashRepository.createIntervention({
        branchId, cashSessionId: sale.cashSessionId, type: 'VOID', targetKind: 'SALE', targetId: id,
        beforeJson: JSON.stringify({ total: Number(sale.total), status: sale.status }),
        afterJson: JSON.stringify({ status: 'CANCELLED' }), reason: reason?.trim() || null, createdByUserId: scope.userId,
      });
      await cashRepository.markAdjusted(sale.cashSessionId);
    }
    return result;
  },

  /** Corrige el método de pago de una venta (desde el detalle de caja). */
  async correct(scope: RequestScope, id: string, dto: { method: string; reason?: string }) {
    const branchId = requireActiveBranch(scope);
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== branchId) throw new NotFoundError('Venta no encontrada');
    if (sale.status === 'CANCELLED') throw new ConflictError('No se puede corregir una venta anulada');
    const beforeMethods = [...new Set((sale.payments ?? []).map((p) => p.method))];
    const result = serialize((await salesRepository.setPaymentsMethod(id, dto.method))!);
    if (sale.cashSessionId) {
      await cashRepository.createIntervention({
        branchId, cashSessionId: sale.cashSessionId, type: 'CORRECTION', targetKind: 'SALE', targetId: id,
        beforeJson: JSON.stringify({ methods: beforeMethods }), afterJson: JSON.stringify({ method: dto.method }),
        reason: dto.reason?.trim() || null, createdByUserId: scope.userId,
      });
      await cashRepository.markAdjusted(sale.cashSessionId);
    }
    return result;
  },
};
