import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const reportsService = {
  /** Reporte de Habitaciones: conteo por estado + ocupación. */
  async rooms(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const grouped = await prisma.room.groupBy({
      by: ['status'],
      where: { branchId },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = { FREE: 0, OCCUPIED: 0, CLEANING: 0, MAINTENANCE: 0 };
    for (const g of grouped) byStatus[g.status] = g._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const occupancy = total > 0 ? round((byStatus.OCCUPIED / total) * 100) : 0;
    return { byStatus, total, occupancy };
  },

  /** Reporte de Limpiezas: conteo por estado y resultado. */
  async housekeeping(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [byStatus, byResult] = await Promise.all([
      prisma.housekeepingTask.groupBy({ by: ['status'], where: { branchId }, _count: { _all: true } }),
      prisma.housekeepingTask.groupBy({ by: ['result'], where: { branchId }, _count: { _all: true } }),
    ]);
    return {
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
      byResult: byResult.map((g) => ({ result: g.result, count: g._count._all })),
    };
  },

  /** Ventas Detalladas: líneas de venta (no anuladas) en un rango. */
  async salesDetailed(scope: RequestScope, from?: Date, to?: Date) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          status: { not: 'CANCELLED' },
          ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
      include: { sale: { select: { id: true, customerName: true, createdAt: true, status: true } } },
      orderBy: { sale: { createdAt: 'desc' } },
    });
    return {
      items: items.map((i) => ({
        saleId: i.saleId,
        date: i.sale.createdAt,
        customer: i.sale.customerName ?? 'Cliente',
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
    };
  },

  /** Simulador Límite de Productos: stock vs venta media diaria (últimos 30 días). */
  async productLimit(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const products = await prisma.product.findMany({ where: { branchId }, include: { stock: true } });
    const soldItems = await prisma.saleItem.findMany({
      where: { sale: { branchId, status: { not: 'CANCELLED' }, createdAt: { gte: since } }, productId: { not: null } },
      select: { productId: true, quantity: true },
    });
    const soldMap = new Map<string, number>();
    for (const it of soldItems) {
      if (!it.productId) continue;
      soldMap.set(it.productId, (soldMap.get(it.productId) ?? 0) + it.quantity);
    }
    return {
      items: products.map((p) => {
        const stock = p.stock.reduce((acc, s) => acc + s.quantity, 0);
        const sold30 = soldMap.get(p.id) ?? 0;
        const avgDaily = round(sold30 / 30);
        const daysOfCover = avgDaily > 0 ? Math.floor(stock / avgDaily) : null;
        return { id: p.id, name: p.name, stock, sold30, avgDaily, daysOfCover };
      }),
    };
  },
};
