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
import { applyStockTx, createMovementTx } from '../movements/movements.repository';
import { operationsConfigService, commissionSnapshot } from '../operations-config/operations-config.service';
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

    // La comisión POS (5% de tarjeta) NO es ingreso del negocio: la retiene el proveedor. El sistema
    // registra el pago NETO, pero congela en cada pago un SNAPSHOT de la comisión vigente al cobrar
    // (%, monto y total cobrado en POS) para auditoría/conciliación histórica que no dependa de la
    // tasa futura de Configuración Operativa.
    const opsCfg = await operationsConfigService.get(scope);
    const payments: SalePaymentInput[] = dto.payments.map((p) => {
      const amount = round(p.amount);
      const snap = commissionSnapshot(opsCfg, p.method, amount);
      return { method: p.method, amount, reference: p.reference || null, commissionPct: snap.commissionPct, commissionAmount: snap.commissionAmount, grossCharged: snap.grossCharged };
    });

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

    // Restitución de stock: los movimientos SALE enlazados a la venta devuelven su cantidad al almacén.
    // - Si la venta pertenece al TURNO ACTUAL (caja abierta) → se ELIMINA la salida (como si no hubiera
    //   ocurrido): la salida desaparece del Kardex y el stock vuelve.
    // - Si es de un turno YA CERRADO → no se toca la historia: se registra un AJUSTE POSITIVO trazable.
    const saleMovs = await prisma.inventoryMovement.findMany({ where: { saleId: id, type: 'SALE' } });
    const openSession = await cashRepository.findOpen(branchId);
    const isCurrentTurn = !!sale.cashSessionId && !!openSession && openSession.id === sale.cashSessionId;

    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id }, data: { status: 'CANCELLED' } });
      for (const mv of saleMovs) {
        const qty = Math.abs(mv.quantity); // cantidad vendida (el movimiento SALE es negativo)
        if (qty <= 0) continue;
        await applyStockTx(tx, mv.productId, mv.warehouseId, qty); // devuelve el stock
        if (isCurrentTurn) {
          await tx.inventoryMovement.delete({ where: { id: mv.id } });
        } else {
          await createMovementTx(tx, {
            branchId, productId: mv.productId, warehouseId: mv.warehouseId, type: 'ADJUST', quantity: qty,
            unitCost: mv.unitCost != null ? Number(mv.unitCost) : null, reference: 'Anulación de venta',
            adjustType: 'ANULACION_VENTA', cashSessionId: openSession?.id ?? null, refMovementId: mv.id,
            saleId: id, createdByUserId: scope.userId,
          });
        }
      }
    });

    const result = serialize((await salesRepository.findById(id))!);
    // Huella de auditoría: anular una venta ya cerrada marca su caja como AJUSTADA.
    if (sale.cashSessionId) {
      await cashRepository.createIntervention({
        branchId, cashSessionId: sale.cashSessionId, type: 'VOID', targetKind: 'SALE', targetId: id,
        beforeJson: JSON.stringify({ total: Number(sale.total), status: sale.status }),
        afterJson: JSON.stringify({ status: 'CANCELLED', stockRestored: saleMovs.length > 0, mode: isCurrentTurn ? 'REMOVED' : 'ADJUSTED' }),
        reason: reason?.trim() || null, createdByUserId: scope.userId,
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

  /**
   * Corrige el DESGLOSE de pagos de una venta (método+monto por línea) SIN cambiar el total cobrado.
   * Caso típico: la recepción registró un pago mixto como un solo medio (p. ej. Yape 31 cuando fue
   * Yape 25 + Efectivo 6) → se re-reparte para que cada medio cuadre. Recalcula el snapshot de comisión.
   */
  async correctPayments(scope: RequestScope, id: string, dto: { payments: { method: string; amount: number; reference?: string }[]; reason?: string }) {
    const branchId = requireActiveBranch(scope);
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== branchId) throw new NotFoundError('Venta no encontrada');
    if (sale.status === 'CANCELLED') throw new ConflictError('No se puede corregir una venta anulada');
    // El Vuelto afecta el saldo de cambio de la estancia; para no descuadrarlo, no se corrige por aquí.
    if (sale.payments.some((p) => p.method === 'VUELTO') || dto.payments.some((p) => p.method === 'VUELTO')) {
      throw new ConflictError('No se puede corregir el desglose de ventas con Vuelto. Anula y vuelve a registrar.');
    }
    const currentPaid = round(sale.payments.reduce((a, p) => a + Number(p.amount), 0));
    const newSum = round(dto.payments.reduce((a, p) => a + p.amount, 0));
    if (Math.abs(newSum - currentPaid) > 0.01) {
      throw new ValidationError(`El desglose (S/ ${newSum.toFixed(2)}) debe sumar exactamente lo cobrado en la venta (S/ ${currentPaid.toFixed(2)}).`);
    }
    const opsCfg = await operationsConfigService.get(scope);
    const payments: SalePaymentInput[] = dto.payments.map((p) => {
      const amount = round(p.amount);
      const snap = commissionSnapshot(opsCfg, p.method, amount);
      return { method: p.method, amount, reference: p.reference?.trim() || null, commissionPct: snap.commissionPct, commissionAmount: snap.commissionAmount, grossCharged: snap.grossCharged };
    });
    const beforeMethods = sale.payments.map((p) => `${p.method}:${Number(p.amount).toFixed(2)}`);
    const result = serialize((await salesRepository.replacePayments(id, branchId, sale.cashSessionId, scope.userId, payments))!);
    if (sale.cashSessionId) {
      await cashRepository.createIntervention({
        branchId, cashSessionId: sale.cashSessionId, type: 'CORRECTION', targetKind: 'SALE', targetId: id,
        beforeJson: JSON.stringify({ payments: beforeMethods }),
        afterJson: JSON.stringify({ payments: payments.map((p) => `${p.method}:${p.amount.toFixed(2)}`) }),
        reason: dto.reason?.trim() || null, createdByUserId: scope.userId,
      });
      await cashRepository.markAdjusted(sale.cashSessionId);
    }
    return result;
  },

  /**
   * Corrección POR LÍNEA (Fase C): edita cantidad/precio de cada ítem y el desglose de pagos, sin tocar
   * las otras líneas. Recalcula subtotales y total; los pagos deben sumar el nuevo total. Si cambia la
   * cantidad de un producto, ajusta el stock con un AJUSTE trazable (no toca la salida SALE original).
   * Deja huella CORRECTION con antes/después por línea y reabre la auditoría (via markAdjusted).
   */
  async correctSaleLines(scope: RequestScope, id: string, dto: { items: { id: string; quantity: number; unitPrice: number }[]; payments: { method: string; amount: number; reference?: string }[]; reason?: string }) {
    const branchId = requireActiveBranch(scope);
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== branchId) throw new NotFoundError('Venta no encontrada');
    if (sale.status === 'CANCELLED') throw new ConflictError('No se puede corregir una venta anulada');
    if (sale.payments.some((p) => p.method === 'VUELTO') || dto.payments.some((p) => p.method === 'VUELTO')) {
      throw new ConflictError('No se puede corregir por línea una venta con Vuelto. Anula y vuelve a registrar.');
    }
    const byId = new Map(sale.items.map((it) => [it.id, it]));
    if (dto.items.length !== sale.items.length || dto.items.some((di) => !byId.has(di.id))) {
      throw new ValidationError('Envía exactamente las líneas de la venta.');
    }
    const newItems = dto.items.map((di) => {
      const it = byId.get(di.id)!;
      return { id: di.id, productId: it.productId, oldQty: it.quantity, quantity: di.quantity, unitPrice: round(di.unitPrice), subtotal: round(di.quantity * di.unitPrice), description: it.description };
    });
    const newTotal = round(newItems.reduce((a, i) => a + i.subtotal, 0));
    const paySum = round(dto.payments.reduce((a, p) => a + p.amount, 0));
    if (Math.abs(paySum - newTotal) > 0.01) {
      throw new ValidationError(`Los pagos (S/ ${paySum.toFixed(2)}) deben sumar el nuevo total de la venta (S/ ${newTotal.toFixed(2)}).`);
    }
    // Almacén por producto para ajustar stock si cambió la cantidad (del movimiento SALE enlazado; si no
    // existe —venta antigua— se usa el almacén por defecto).
    const saleMovs = await prisma.inventoryMovement.findMany({ where: { saleId: id, type: 'SALE' } });
    const whByProduct = new Map(saleMovs.map((m) => [m.productId, m.warehouseId]));
    const defaultWh = await productsRepository.defaultWarehouse(branchId);
    const opsCfg = await operationsConfigService.get(scope);
    const payments: SalePaymentInput[] = dto.payments.map((p) => {
      const amount = round(p.amount);
      const snap = commissionSnapshot(opsCfg, p.method, amount);
      return { method: p.method, amount, reference: p.reference?.trim() || null, commissionPct: snap.commissionPct, commissionAmount: snap.commissionAmount, grossCharged: snap.grossCharged };
    });

    try {
      await prisma.$transaction(async (tx) => {
        for (const ni of newItems) {
          await tx.saleItem.update({ where: { id: ni.id }, data: { quantity: ni.quantity, unitPrice: ni.unitPrice, subtotal: ni.subtotal } });
          if (ni.productId && ni.quantity !== ni.oldQty) {
            const wh = whByProduct.get(ni.productId) ?? defaultWh.id;
            const delta = ni.oldQty - ni.quantity; // + devuelve stock (se vendió menos); − consume (se vendió más)
            await applyStockTx(tx, ni.productId, wh, delta);
            await createMovementTx(tx, {
              branchId, productId: ni.productId, warehouseId: wh, type: 'ADJUST', quantity: delta,
              reference: 'Corrección de cantidad', adjustType: 'CORRECCION_LINEA', cashSessionId: sale.cashSessionId,
              saleId: id, createdByUserId: scope.userId,
            });
          }
        }
        await tx.sale.update({ where: { id }, data: { total: newTotal, status: newTotal > 0 && paySum >= newTotal - 0.001 ? 'PAID' : 'OPEN' } });
        await tx.payment.deleteMany({ where: { saleId: id } });
        await tx.payment.createMany({ data: payments.map((p) => ({ saleId: id, branchId, cashSessionId: sale.cashSessionId, method: p.method, amount: p.amount, reference: p.reference, commissionPct: p.commissionPct ?? null, commissionAmount: p.commissionAmount ?? null, grossCharged: p.grossCharged ?? null, createdByUserId: scope.userId })) });
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('STOCK_INSUFFICIENT')) throw new ValidationError('Stock insuficiente para aumentar la cantidad de un producto.');
      throw err;
    }

    const result = serialize((await salesRepository.findById(id))!);
    if (sale.cashSessionId) {
      await cashRepository.createIntervention({
        branchId, cashSessionId: sale.cashSessionId, type: 'CORRECTION', targetKind: 'SALE', targetId: id,
        beforeJson: JSON.stringify({ total: Number(sale.total), items: sale.items.map((it) => ({ desc: it.description, qty: it.quantity, price: Number(it.unitPrice), subtotal: Number(it.subtotal) })), payments: sale.payments.map((p) => `${p.method}:${Number(p.amount).toFixed(2)}`) }),
        afterJson: JSON.stringify({ total: newTotal, items: newItems.map((i) => ({ desc: i.description, qty: i.quantity, price: i.unitPrice, subtotal: i.subtotal })), payments: payments.map((p) => `${p.method}:${p.amount.toFixed(2)}`), stockAdjusted: newItems.some((i) => i.productId && i.quantity !== i.oldQty) }),
        reason: dto.reason?.trim() || null, createdByUserId: scope.userId,
      });
      await cashRepository.markAdjusted(sale.cashSessionId);
    }
    return result;
  },

  /**
   * Anula UNA línea de la venta (Fase D). Corrección administrativa: la línea se EXCLUYE de los totales
   * válidos pero se conserva como ANULADA para auditoría; NO toca las demás líneas ni los pagos (el
   * tratamiento del dinero efectivamente devuelto se define en un flujo aparte). Si es producto, devuelve
   * stock con un AJUSTE trazable. Si era la última línea vigente, equivale a anular toda la venta.
   */
  async voidLine(scope: RequestScope, id: string, dto: { itemId: string; reason?: string }) {
    const branchId = requireActiveBranch(scope);
    const sale = await salesRepository.findById(id);
    if (!sale || sale.branchId !== branchId) throw new NotFoundError('Venta no encontrada');
    if (sale.status === 'CANCELLED') throw new ConflictError('La venta ya está anulada');
    const item = sale.items.find((it) => it.id === dto.itemId);
    if (!item) throw new ValidationError('La línea no pertenece a esta venta');
    if (item.voided) throw new ConflictError('La línea ya está anulada');
    const activeItems = sale.items.filter((it) => !it.voided);
    // Última línea vigente → anular toda la venta (usa el flujo de anulación completa).
    if (activeItems.length <= 1) return this.cancel(scope, id, dto.reason);

    const qty = item.quantity;
    const newTotal = round(activeItems.filter((it) => it.id !== item.id).reduce((a, it) => a + Number(it.subtotal), 0));
    // Almacén del producto (del movimiento SALE enlazado; si no existe, el almacén por defecto).
    let stockRestored = false;
    let wh: string | null = null;
    if (item.productId) {
      const saleMovs = await prisma.inventoryMovement.findMany({ where: { saleId: id, type: 'SALE', productId: item.productId } });
      wh = saleMovs[0]?.warehouseId ?? (await productsRepository.defaultWarehouse(branchId)).id;
    }
    await prisma.$transaction(async (tx) => {
      await tx.saleItem.update({ where: { id: item.id }, data: { voided: true, voidedAt: new Date(), voidedByUserId: scope.userId, voidReason: dto.reason?.trim() || null } });
      if (item.productId && wh) {
        await applyStockTx(tx, item.productId, wh, qty); // devuelve el stock de la línea anulada
        await createMovementTx(tx, {
          branchId, productId: item.productId, warehouseId: wh, type: 'ADJUST', quantity: qty,
          reference: 'Anulación de línea', adjustType: 'ANULACION_LINEA', cashSessionId: sale.cashSessionId,
          saleId: id, createdByUserId: scope.userId,
        });
        stockRestored = true;
      }
      // El total válido excluye la línea anulada. Los PAGOS no se tocan (tratamiento de dinero aparte).
      await tx.sale.update({ where: { id }, data: { total: newTotal } });
    });

    const result = serialize((await salesRepository.findById(id))!);
    if (sale.cashSessionId) {
      await cashRepository.createIntervention({
        branchId, cashSessionId: sale.cashSessionId, type: 'VOID', targetKind: 'SALE', targetId: id,
        beforeJson: JSON.stringify({ line: { id: item.id, desc: item.description, qty, price: Number(item.unitPrice), subtotal: Number(item.subtotal) }, total: Number(sale.total) }),
        afterJson: JSON.stringify({ lineVoided: item.id, total: newTotal, impacto: { inventario: stockRestored ? `+${qty}` : 'n/a', caja: 'sin devolución (tratamiento de dinero aparte)', conciliacion: 'la línea deja de contar en los totales' } }),
        reason: dto.reason?.trim() || null, createdByUserId: scope.userId,
      });
      await cashRepository.markAdjusted(sale.cashSessionId);
    }
    return result;
  },
};
