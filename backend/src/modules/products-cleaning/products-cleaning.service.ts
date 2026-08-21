import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { buildProductKardex, computeTurnWindow, productWarehouses } from '../../shared/product-kardex';

/**
 * Kardex de PRODUCTOS-LIMPIEZA (almacén de productos de frigobar que gestiona Limpieza).
 * Misma base que PRODUCTOS-RECEPCIÓN. Separado por completo de "Inventario Limpieza" (ropa/amenities).
 *  - Ingresos: abastecimiento desde el Almacén General.
 *  - Salidas: reposición de frigobar a habitaciones (interactivo: hora/habitación/cantidad/usuario).
 *    El flujo real de reposición pertenece al módulo FRIOBAR (aún no implementado); aquí queda la estructura.
 *  - Ajustes: transferencia interna, sobrante, vencido, merma, faltante (módulo `adjustments`).
 */
export const productsCleaningService = {
  async list(scope: RequestScope, opts?: { date?: string; shift?: string }) {
    const branchId = requireActiveBranch(scope);
    const { limpieza, generalIds } = await productWarehouses(branchId);
    if (!limpieza) return { warehouseId: null, turn: null, items: [] };
    const shifts = await prisma.roleShift.findMany({ where: { branchId, role: 'LIMPIEZA' } });
    const win = computeTurnWindow(shifts, opts?.date, opts?.shift);
    const items = await buildProductKardex({ branchId, whId: limpieza.id, win, generalIds, minField: 'reorderPoint' });
    return {
      warehouseId: limpieza.id,
      turn: { shift: win.shift, businessDate: win.businessDate, startTime: win.startTime, endTime: win.endTime, isCurrent: win.isCurrent, from: win.from, to: win.to },
      items,
    };
  },

  /**
   * Detalle interactivo de SALIDAS (reposiciones de frigobar a habitación) en una ventana.
   * Estructura lista: cuando el módulo FRIOBAR registre las reposiciones (SALE/OUT con roomId
   * en el almacén PRODUCTOS-LIMPIEZA), aparecerán aquí. Por ahora normalmente vendrá vacío.
   */
  async salidasDetail(scope: RequestScope, params: { productId?: string; from?: string; to?: string }) {
    const branchId = requireActiveBranch(scope);
    const { limpieza } = await productWarehouses(branchId);
    if (!limpieza) return [];
    const where: Record<string, unknown> = {
      branchId,
      warehouseId: limpieza.id,
      type: { in: ['SALE', 'OUT'] },
      quantity: { lt: 0 },
      adjustType: null, // las bajas por ajuste no son salidas
    };
    if (params.productId) where.productId = params.productId;
    if (params.from || params.to) {
      where.createdAt = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lt: new Date(params.to) } : {}) };
    }
    const movs = await prisma.inventoryMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    const userIds = [...new Set(movs.map((m) => m.createdByUserId).filter((x): x is string => !!x))];
    const roomIds = [...new Set(movs.map((m) => m.roomId).filter((x): x is string => !!x))];
    const [users, rooms, products] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }),
      prisma.product.findMany({ where: { id: { in: [...new Set(movs.map((m) => m.productId))] } }, select: { id: true, name: true } }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.name]));
    const rMap = new Map(rooms.map((r) => [r.id, r.number]));
    const pMap = new Map(products.map((p) => [p.id, p.name]));
    return movs.map((m) => ({
      id: m.id,
      at: m.createdAt,
      room: m.roomId ? (rMap.get(m.roomId) ?? null) : null,
      productName: pMap.get(m.productId) ?? '—',
      quantity: Math.abs(m.quantity),
      user: m.createdByUserId ? (uMap.get(m.createdByUserId) ?? null) : null,
    }));
  },
};
