import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { ValidationError } from '../../shared/errors';
import { prisma } from '../../config/prisma';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';
import { cashRepository } from '../cash/cash.repository';
import { productWarehouses } from '../../shared/product-kardex';

/**
 * Ajustes trazables del kardex de productos (Fase 1, solo inventario — no mueve caja):
 *  - TRANSFER  : transferencia interna entre almacenes (RECEPCIÓN ↔ PRODUCTOS-LIMPIEZA).
 *  - SOBRANTE  : excedente físico que se retira del área y regresa al Almacén General.
 *  - VENCIDO   : retiro por vencimiento (baja definitiva, no regresa a stock).
 *  - MERMA     : perdido / dañado / inutilizable (baja definitiva).
 *  - FALTANTE  : diferencia (sistema > físico) pendiente de revisión.
 * Todos guardan adjustType, reference (motivo), turno de caja, usuario y (opcional) habitación.
 * Ventas no registradas y pérdida atribuida (que tocan caja) son Fase 2.
 */
export const ADJUST_KINDS = ['TRANSFER', 'SOBRANTE', 'VENCIDO', 'MERMA', 'FALTANTE'] as const;

export const adjustmentSchema = z
  .object({
    kind: z.enum(ADJUST_KINDS),
    productId: z.string().min(1),
    warehouseId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    toWarehouseId: z.string().min(1).optional(), // requerido solo en TRANSFER
    roomId: z.string().min(1).optional(),
    reference: z.string().max(300).optional().or(z.literal('')),
  })
  .refine((v) => v.kind !== 'TRANSFER' || !!v.toWarehouseId, { message: 'Indica el almacén destino de la transferencia', path: ['toWarehouseId'] });
export type AdjustmentDto = z.infer<typeof adjustmentSchema>;

const DEFAULT_REF: Record<(typeof ADJUST_KINDS)[number], string> = {
  TRANSFER: 'Transferencia interna',
  SOBRANTE: 'Sobrante — regresa a Almacén General',
  VENCIDO: 'Producto vencido',
  MERMA: 'Perdido / merma',
  FALTANTE: 'Faltante de inventario (pendiente de revisión)',
};

function mapStockErr(err: unknown): never {
  if (err instanceof Error && err.message === 'STOCK_INSUFFICIENT') throw new ValidationError('Stock insuficiente para el ajuste');
  throw err as Error;
}

export const adjustmentsService = {
  async create(scope: RequestScope, dto: AdjustmentDto) {
    const branchId = requireActiveBranch(scope);
    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product || product.branchId !== branchId) throw new ValidationError('Producto inválido');
    const wh = await prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!wh || wh.branchId !== branchId) throw new ValidationError('Almacén inválido');

    const cashSessionId = (await cashRepository.findOpen(branchId))?.id ?? null;
    const unitCost = product.cost != null ? Number(product.cost) : null;
    const reference = dto.reference?.trim() || DEFAULT_REF[dto.kind];
    const commonBase = { branchId, productId: dto.productId, unitCost, reference, adjustType: dto.kind, cashSessionId, roomId: dto.roomId ?? null, createdByUserId: scope.userId };

    // TRANSFER y SOBRANTE mueven a otro almacén (par de movimientos con contrapartida).
    if (dto.kind === 'TRANSFER' || dto.kind === 'SOBRANTE') {
      let toWhId: string;
      if (dto.kind === 'TRANSFER') {
        const toWh = await prisma.warehouse.findUnique({ where: { id: dto.toWarehouseId! } });
        if (!toWh || toWh.branchId !== branchId) throw new ValidationError('Almacén destino inválido');
        if (toWh.id === wh.id) throw new ValidationError('El origen y el destino deben ser distintos');
        toWhId = toWh.id;
      } else {
        // SOBRANTE regresa al Almacén General real (PRODUCTS que NO es "PRODUCTOS LIMPIEZA").
        const { general } = await productWarehouses(branchId);
        if (!general) throw new ValidationError('No hay Almacén General de Productos');
        toWhId = general.id;
      }
      return prisma
        .$transaction(async (tx) => {
          await applyStockTx(tx, dto.productId, wh.id, -dto.quantity);
          await applyStockTx(tx, dto.productId, toWhId, dto.quantity);
          const out = await createMovementTx(tx, { ...commonBase, warehouseId: wh.id, type: 'TRANSFER', quantity: -dto.quantity, relatedWarehouseId: toWhId });
          const inn = await createMovementTx(tx, { ...commonBase, warehouseId: toWhId, type: 'TRANSFER', quantity: dto.quantity, relatedWarehouseId: wh.id });
          return { outId: out.id, inId: inn.id };
        })
        .catch(mapStockErr);
    }

    // VENCIDO / MERMA / FALTANTE: baja simple (sin contrapartida). No regresa a stock.
    return prisma
      .$transaction(async (tx) => {
        await applyStockTx(tx, dto.productId, wh.id, -dto.quantity);
        const mv = await createMovementTx(tx, { ...commonBase, warehouseId: wh.id, type: 'ADJUST', quantity: -dto.quantity, relatedWarehouseId: null });
        return { id: mv.id };
      })
      .catch(mapStockErr);
  },

  /** Detalle de ajustes de un almacén dentro de una ventana (para el kardex interactivo). */
  async detail(scope: RequestScope, params: { warehouseId: string; productId?: string; from?: string; to?: string }) {
    const branchId = requireActiveBranch(scope);
    const where: Record<string, unknown> = {
      branchId,
      warehouseId: params.warehouseId,
      OR: [{ adjustType: { not: null } }, { type: 'ADJUST' }],
    };
    if (params.productId) where.productId = params.productId;
    if (params.from || params.to) {
      where.createdAt = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lt: new Date(params.to) } : {}) };
    }
    const movs = await prisma.inventoryMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    const userIds = [...new Set(movs.flatMap((m) => [m.createdByUserId, m.approvedByUserId].filter((x): x is string => !!x)))];
    const roomIds = [...new Set(movs.map((m) => m.roomId).filter((x): x is string => !!x))];
    const whIds = [...new Set(movs.map((m) => m.relatedWarehouseId).filter((x): x is string => !!x))];
    const [users, rooms, whs, products] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }),
      prisma.warehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { id: { in: [...new Set(movs.map((m) => m.productId))] } }, select: { id: true, name: true } }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.name]));
    const rMap = new Map(rooms.map((r) => [r.id, r.number]));
    const wMap = new Map(whs.map((w) => [w.id, w.name]));
    const pMap = new Map(products.map((p) => [p.id, p.name]));
    return movs.map((m) => ({
      id: m.id,
      at: m.createdAt,
      kind: m.adjustType ?? 'ADJUST',
      productName: pMap.get(m.productId) ?? '—',
      quantity: m.quantity,
      counterpart: m.relatedWarehouseId ? (wMap.get(m.relatedWarehouseId) ?? null) : null,
      room: m.roomId ? (rMap.get(m.roomId) ?? null) : null,
      reason: m.reference ?? null,
      user: m.createdByUserId ? (uMap.get(m.createdByUserId) ?? null) : null,
      approvedBy: m.approvedByUserId ? (uMap.get(m.approvedByUserId) ?? null) : null,
    }));
  },
};
