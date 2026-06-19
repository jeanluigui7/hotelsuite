import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/** Inventario de Recepción: stock en el almacén de recepción, con flujo de
 *  solicitud → envío (admin) → recepción (suma stock), y baja de stock. */

export const requestSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
});
export const writeOffSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  reason: z.string().min(1).max(200),
});
export type RequestDto = z.infer<typeof requestSchema>;
export type WriteOffDto = z.infer<typeof writeOffSchema>;

async function receptionWarehouseId(branchId: string): Promise<string> {
  let wh = await prisma.warehouse.findFirst({ where: { branchId, type: 'RECEPTION' } });
  if (!wh) wh = await prisma.warehouse.create({ data: { branchId, name: 'Recepción', type: 'RECEPTION' } });
  return wh.id;
}

export const receptionInventoryService = {
  /** Productos con stock actual en recepción, ingresos/salidas y mínimo. */
  async list(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const [products, stocks, ins, outs] = await Promise.all([
      prisma.product.findMany({ where: { branchId, status: 'active' }, orderBy: { name: 'asc' } }),
      prisma.stock.findMany({ where: { warehouseId: whId } }),
      prisma.inventoryMovement.groupBy({ by: ['productId'], where: { branchId, warehouseId: whId, quantity: { gt: 0 } }, _sum: { quantity: true } }),
      prisma.inventoryMovement.groupBy({ by: ['productId'], where: { branchId, warehouseId: whId, quantity: { lt: 0 } }, _sum: { quantity: true } }),
    ]);
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));
    const inMap = new Map(ins.map((r) => [r.productId, r._sum.quantity ?? 0]));
    const outMap = new Map(outs.map((r) => [r.productId, Math.abs(r._sum.quantity ?? 0)]));
    return {
      warehouseId: whId,
      items: products.map((p) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        stock: stockMap.get(p.id) ?? 0,
        min: p.reorderPoint,
        ingresos: inMap.get(p.id) ?? 0,
        salidas: outMap.get(p.id) ?? 0,
        belowMin: (stockMap.get(p.id) ?? 0) <= p.reorderPoint,
      })),
    };
  },

  async createRequest(scope: RequestScope, dto: RequestDto) {
    const branchId = requireActiveBranch(scope);
    return prisma.productRequest.create({
      data: {
        branchId,
        status: 'REQUESTED',
        createdByUserId: scope.userId,
        items: { create: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
      },
      include: { items: true },
    });
  },

  async listRequests(scope: RequestScope, status?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.productRequest.findMany({
      where: { branchId, ...(status ? { status } : {}) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    const productIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.productId)))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    const pmap = new Map(products.map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      items: r.items.map((i) => ({ productId: i.productId, name: pmap.get(i.productId) ?? '—', quantity: i.quantity })),
    }));
  },

  /** Admin envía lo solicitado (REQUESTED → SENT). */
  async sendRequest(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const req = await prisma.productRequest.findUnique({ where: { id } });
    if (!req || req.branchId !== branchId) throw new ValidationError('Solicitud no encontrada');
    if (req.status !== 'REQUESTED') throw new ValidationError('La solicitud ya fue procesada');
    return prisma.productRequest.update({ where: { id }, data: { status: 'SENT' } });
  },

  /** Recepción confirma recepción (SENT → RECEIVED): suma stock + movimiento + cola de impresión. */
  async receiveRequest(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const req = await prisma.productRequest.findUnique({ where: { id }, include: { items: true } });
    if (!req || req.branchId !== branchId) throw new ValidationError('Solicitud no encontrada');
    if (req.status !== 'SENT') throw new ValidationError('La solicitud no está lista para recepcionar');

    await prisma.$transaction(async (tx) => {
      for (const it of req.items) {
        await tx.stock.upsert({
          where: { productId_warehouseId: { productId: it.productId, warehouseId: whId } },
          update: { quantity: { increment: it.quantity } },
          create: { productId: it.productId, warehouseId: whId, quantity: it.quantity },
        });
        await tx.inventoryMovement.create({
          data: { branchId, productId: it.productId, warehouseId: whId, type: 'IN', quantity: it.quantity, reference: `Recepción ${id.slice(0, 8)}`, createdByUserId: scope.userId },
        });
      }
      await tx.productRequest.update({ where: { id }, data: { status: 'RECEIVED' } });
      await tx.printJob.create({
        data: { branchId, type: 'RECEPCION', title: `Recepción de productos (${req.items.length} ítems)`, payload: JSON.stringify(req.items), status: 'PENDING' },
      });
    });
    return { received: req.items.length };
  },

  /** Dar de baja stock de recepción (requiere permiso de eliminar). */
  async writeOff(scope: RequestScope, dto: WriteOffDto) {
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const stock = await prisma.stock.findUnique({ where: { productId_warehouseId: { productId: dto.productId, warehouseId: whId } } });
    if (!stock || stock.quantity < dto.quantity) throw new ValidationError('Stock insuficiente para dar de baja');
    await prisma.$transaction(async (tx) => {
      await tx.stock.update({ where: { productId_warehouseId: { productId: dto.productId, warehouseId: whId } }, data: { quantity: { decrement: dto.quantity } } });
      await tx.inventoryMovement.create({ data: { branchId, productId: dto.productId, warehouseId: whId, type: 'OUT', quantity: -dto.quantity, reference: `Baja: ${dto.reason}`, createdByUserId: scope.userId } });
      await tx.stockWriteOff.create({ data: { branchId, productId: dto.productId, quantity: dto.quantity, reason: dto.reason, createdByUserId: scope.userId } });
    });
    return { ok: true };
  },

  async printQueue(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    return prisma.printJob.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' }, take: 50 });
  },
};
