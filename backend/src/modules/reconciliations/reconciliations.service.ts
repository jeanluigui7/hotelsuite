import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { ValidationError, NotFoundError, ConflictError } from '../../shared/errors';
import { prisma } from '../../config/prisma';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';

/**
 * Regularizaciones posteriores a un cierre de caja CONFIRMADO. Reglas:
 *  - El cierre NO se edita ni se reabre; sus valores originales (esperado, declarado, diferencia)
 *    se conservan intactos.
 *  - VENTA_NO_REGISTRADA: explica un SOBRANTE. Descuenta el producto del inventario y reclasifica
 *    parte del sobrante como venta. NO crea pago (el efectivo ya se contó en el sobrante) → no duplica caja.
 *  - PERDIDA_COLABORADOR: reclasifica un FALTANTE de inventario (producto entregado sin cobrar).
 *    NO mueve caja. Requiere aprobación de administración.
 * La "diferencia pendiente" = diferencia original − Σ(regularizaciones que afectan caja).
 */
export const unregisteredSaleSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  note: z.string().max(500).optional().or(z.literal('')),
});
export type UnregisteredSaleDto = z.infer<typeof unregisteredSaleSchema>;

export const attributeLossSchema = z.object({
  movementId: z.string().min(1),
  collaborator: z.string().max(160).optional().or(z.literal('')),
  amount: z.coerce.number().min(0).optional(),
  note: z.string().max(500).optional().or(z.literal('')),
});
export type AttributeLossDto = z.infer<typeof attributeLossSchema>;

function isAdmin(scope: RequestScope): boolean {
  return scope.isSuperAdmin || scope.permissions.includes('settings:edit');
}

// La diferencia del cierre se deriva (no se persiste): declarado − esperado.
function diffOf(s: { closingAmount: unknown; expectedAmount: unknown }): number {
  const declared = s.closingAmount != null ? Number(s.closingAmount) : 0;
  const expected = s.expectedAmount != null ? Number(s.expectedAmount) : 0;
  return Math.round((declared - expected) * 100) / 100;
}

export const reconciliationsService = {
  /** Resumen de caja con la diferencia original y su conciliación posterior. */
  async summary(scope: RequestScope, sessionId: string) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');
    const recs = await prisma.cashReconciliation.findMany({ where: { branchId, cashSessionId: sessionId }, orderBy: { createdAt: 'asc' } });
    const userIds = [...new Set(recs.flatMap((r) => [r.createdByUserId, r.approvedByUserId].filter((x): x is string => !!x)))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const uMap = new Map(users.map((u) => [u.id, u.name]));
    const originalDiff = diffOf(session);
    const cashResolved = recs.filter((r) => r.affectsCash).reduce((a, r) => a + Number(r.amount), 0);
    // El sobrante se reduce hacia 0 con lo conciliado (sin cambiar de signo).
    const pending = originalDiff > 0 ? Math.max(0, Math.round((originalDiff - cashResolved) * 100) / 100) : originalDiff;
    return {
      expected: session.expectedAmount != null ? Number(session.expectedAmount) : null,
      declared: session.closingAmount != null ? Number(session.closingAmount) : null,
      originalDifference: originalDiff,
      pendingDifference: pending,
      reconciliations: recs.map((r) => ({
        id: r.id,
        at: r.createdAt,
        type: r.type,
        amount: Number(r.amount),
        affectsCash: r.affectsCash,
        quantity: r.quantity,
        note: r.note,
        by: r.createdByUserId ? (uMap.get(r.createdByUserId) ?? null) : null,
        approvedBy: r.approvedByUserId ? (uMap.get(r.approvedByUserId) ?? null) : null,
      })),
    };
  },

  /** VENTA NO REGISTRADA: reclasifica parte del sobrante como venta y descuenta inventario. */
  async unregisteredSale(scope: RequestScope, sessionId: string, dto: UnregisteredSaleDto) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');
    if (session.status !== 'CLOSED') throw new ConflictError('El turno debe estar cerrado para regularizar una venta no registrada.');
    const originalDiff = diffOf(session);
    if (originalDiff <= 0) throw new ConflictError('Este turno no tiene sobrante que reclasificar.');
    const already = (await prisma.cashReconciliation.findMany({ where: { branchId, cashSessionId: sessionId, affectsCash: true } })).reduce((a, r) => a + Number(r.amount), 0);
    const pending = Math.round((originalDiff - already) * 100) / 100;
    if (dto.amount > pending + 0.001) throw new ValidationError(`El importe (S/ ${dto.amount.toFixed(2)}) excede el sobrante pendiente (S/ ${pending.toFixed(2)}).`);

    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product || product.branchId !== branchId) throw new ValidationError('Producto inválido');
    const wh = await prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!wh || wh.branchId !== branchId) throw new ValidationError('Almacén inválido');

    return prisma.$transaction(async (tx) => {
      await applyStockTx(tx, dto.productId, wh.id, -dto.quantity);
      const mv = await createMovementTx(tx, {
        branchId, productId: dto.productId, warehouseId: wh.id, type: 'SALE', quantity: -dto.quantity,
        unitCost: product.cost != null ? Number(product.cost) : null,
        reference: dto.note?.trim() || 'Venta no registrada (regularización)',
        adjustType: 'VENTA_NO_REGISTRADA', cashSessionId: sessionId, createdByUserId: scope.userId, approvedByUserId: scope.userId,
      });
      const rec = await tx.cashReconciliation.create({
        data: {
          branchId, cashSessionId: sessionId, type: 'VENTA_NO_REGISTRADA', amount: dto.amount, affectsCash: true,
          productId: dto.productId, quantity: dto.quantity, movementId: mv.id, note: dto.note?.trim() || null,
          createdByUserId: scope.userId, approvedByUserId: scope.userId,
        },
      });
      return { reconciliationId: rec.id, movementId: mv.id };
    }).catch((err) => {
      if (err instanceof Error && err.message === 'STOCK_INSUFFICIENT') throw new ValidationError('Stock insuficiente para descontar el producto');
      throw err as Error;
    });
  },

  /** PÉRDIDA ATRIBUIDA AL COLABORADOR: reclasifica un FALTANTE (solo admin). No mueve caja ni stock. */
  async attributeLoss(scope: RequestScope, dto: AttributeLossDto) {
    const branchId = requireActiveBranch(scope);
    if (!isAdmin(scope)) throw new ConflictError('Solo administración puede atribuir una pérdida al colaborador.');
    const mv = await prisma.inventoryMovement.findUnique({ where: { id: dto.movementId } });
    if (!mv || mv.branchId !== branchId) throw new NotFoundError('Movimiento no encontrado');
    if (mv.adjustType !== 'FALTANTE') throw new ConflictError('Solo un FALTANTE de inventario puede atribuirse como pérdida al colaborador.');
    const product = await prisma.product.findUnique({ where: { id: mv.productId }, select: { cost: true } });
    const qty = Math.abs(mv.quantity);
    const amount = dto.amount != null && dto.amount > 0 ? dto.amount : (product?.cost != null ? Number(product.cost) * qty : 0);
    const note = [dto.collaborator ? `Colaborador: ${dto.collaborator}` : null, dto.note?.trim() || null].filter(Boolean).join(' — ') || 'Pérdida atribuida al colaborador';

    return prisma.$transaction(async (tx) => {
      // Reclasifica el faltante (no altera cantidad/stock); marca aprobación de administración.
      await tx.inventoryMovement.update({ where: { id: mv.id }, data: { adjustType: 'PERDIDA_COLABORADOR', approvedByUserId: scope.userId, reference: note } });
      const rec = await tx.cashReconciliation.create({
        data: {
          branchId, cashSessionId: mv.cashSessionId ?? '', type: 'PERDIDA_COLABORADOR', amount, affectsCash: false,
          productId: mv.productId, quantity: qty, movementId: mv.id, note,
          createdByUserId: scope.userId, approvedByUserId: scope.userId,
        },
      });
      return { reconciliationId: rec.id, movementId: mv.id };
    });
  },
};
