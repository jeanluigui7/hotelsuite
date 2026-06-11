import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const logisticsService = {
  /** Valorización de stock: cantidad total × último costo, por producto. */
  async valuation(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const products = await prisma.product.findMany({
      where: { branchId },
      include: { stock: true },
    });
    const items = products.map((p) => {
      const qty = p.stock.reduce((acc, s) => acc + s.quantity, 0);
      const cost = p.cost != null ? Number(p.cost) : 0;
      return { id: p.id, name: p.name, quantity: qty, cost, value: round(qty * cost) };
    });
    const total = round(items.reduce((acc, i) => acc + i.value, 0));
    return { items, total };
  },

  /** Productos a reponer: stock total ≤ punto de reposición. */
  async reorder(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const products = await prisma.product.findMany({
      where: { branchId, status: 'active' },
      include: { stock: true },
    });
    const items = products
      .map((p) => {
        const qty = p.stock.reduce((acc, s) => acc + s.quantity, 0);
        return { id: p.id, name: p.name, stock: qty, reorderPoint: p.reorderPoint };
      })
      .filter((p) => p.stock <= p.reorderPoint);
    return { items };
  },

  /** Kardex de un producto: movimientos con saldo corrido (opcionalmente por almacén). */
  async kardex(scope: RequestScope, productId: string, warehouseId?: string) {
    const branchId = requireActiveBranch(scope);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.branchId !== branchId) {
      return { product: null, balance: 0, items: [] };
    }
    const movements = await prisma.inventoryMovement.findMany({
      where: { branchId, productId, ...(warehouseId ? { warehouseId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    let balance = 0;
    const items = movements.map((m) => {
      balance += m.quantity;
      return {
        id: m.id,
        date: m.createdAt,
        type: m.type,
        quantity: m.quantity,
        balance,
        unitCost: m.unitCost != null ? Number(m.unitCost) : null,
        reference: m.reference,
      };
    });
    return { product: { id: product.id, name: product.name }, balance, items };
  },

  /** Reporte de ganancias: ventas − costo en un rango de fechas. */
  async profit(scope: RequestScope, from?: Date, to?: Date) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          status: { not: 'CANCELLED' },
          ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
    });
    let revenue = 0;
    let cost = 0;
    for (const it of items) {
      revenue += Number(it.subtotal);
      cost += (it.unitCost != null ? Number(it.unitCost) : 0) * it.quantity;
    }
    revenue = round(revenue);
    cost = round(cost);
    return { revenue, cost, profit: round(revenue - cost), lineCount: items.length };
  },
};
