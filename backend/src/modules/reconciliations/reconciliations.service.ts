import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { ValidationError, NotFoundError, ConflictError } from '../../shared/errors';
import { prisma } from '../../config/prisma';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';
import { cashRepository } from '../cash/cash.repository';
import { requiresReference, PAYMENT_REFERENCE_REQUIRED } from '../../shared/payments';

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

// VENTA NO REGISTRADA desde el Kardex → Ajuste. Clasificación del cobro:
//  - COBRADA: el dinero SÍ se cobró (con medio) → se regulariza como venta cobrada (REGULARIZADA).
//  - NO_COBRADA: el producto salió sin cobrar (incidencia del colaborador; NO descuenta sueldo aún).
//  - POR_VERIFICAR: pendiente de revisión de administración.
export const unregisteredSaleV2Schema = z.object({
  sessionId: z.string().min(1).optional(), // caja/turno de origen (default: caja abierta)
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().positive(),
  classification: z.enum(['COBRADA', 'NO_COBRADA', 'POR_VERIFICAR']),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET']).optional(),
  reference: z.string().max(120).optional().or(z.literal('')), // código de verificación/operación
  roomId: z.string().min(1).optional(),
  stayId: z.string().min(1).optional(),
  note: z.string().max(500).optional().or(z.literal('')),
})
  .refine((v) => v.classification !== 'COBRADA' || !!v.method, { message: 'Indica el medio de pago con el que se cobró', path: ['method'] })
  // Solo COBRADA con medio virtual exige el código; NO_COBRADA / POR_VERIFICAR no piden medio ni código.
  .refine((v) => !(v.classification === 'COBRADA' && v.method && requiresReference(v.method)) || !!(v.reference && v.reference.trim()), {
    message: PAYMENT_REFERENCE_REQUIRED, path: ['reference'],
  });
export type UnregisteredSaleV2Dto = z.infer<typeof unregisteredSaleV2Schema>;

const VERIFY_STATUS: Record<UnregisteredSaleV2Dto['classification'], string> = {
  COBRADA: 'REGULARIZADA',
  NO_COBRADA: 'NO_COBRADA',
  POR_VERIFICAR: 'POR_VERIFICAR',
};

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

  /**
   * VENTA NO REGISTRADA (desde Kardex → Ajuste): crea una venta marcada (unregistered) como fuente
   * única, en la CAJA/TURNO seleccionado (histórico o abierto), sin crear una segunda caja, sin
   * reabrirla y sin alterar su fecha/turno original.
   *  - COBRADA: crea un Payment con el medio y (si es virtual) el código de verificación → el dinero
   *    queda reflejado en el método del turno y el código auditable. NO_COBRADA / POR_VERIFICAR no
   *    generan Payment (quedan como deuda / pendiente de revisión).
   *  - Si la caja estaba CERRADA pasa a AJUSTADA (conservando su cierre) y deja huella
   *    CashIntervention(UNREGISTERED_SALE). Si ya estaba AJUSTADA, permanece AJUSTADA.
   */
  async unregisteredSaleV2(scope: RequestScope, dto: UnregisteredSaleV2Dto) {
    const branchId = requireActiveBranch(scope);
    const session = dto.sessionId
      ? await prisma.cashSession.findUnique({ where: { id: dto.sessionId } })
      : await cashRepository.findOpen(branchId);
    if (!session || session.branchId !== branchId) throw new NotFoundError('No se encontró la caja a la que relacionar la venta.');

    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product || product.branchId !== branchId) throw new ValidationError('Producto inválido');
    const wh = await prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!wh || wh.branchId !== branchId) throw new ValidationError('Almacén inválido');

    const total = Math.round(dto.quantity * dto.unitPrice * 100) / 100;
    const unitCost = product.cost != null ? Number(product.cost) : null;
    const verifyStatus = VERIFY_STATUS[dto.classification];
    const noteBase = dto.note?.trim() || 'Venta no registrada';

    const result = await prisma.$transaction(async (tx) => {
      await applyStockTx(tx, dto.productId, wh.id, -dto.quantity);
      const mv = await createMovementTx(tx, {
        branchId, productId: dto.productId, warehouseId: wh.id, type: 'SALE', quantity: -dto.quantity,
        unitCost, reference: `${noteBase} (${dto.classification})`,
        adjustType: 'VENTA_NO_REGISTRADA', cashSessionId: session.id, roomId: dto.roomId ?? null,
        createdByUserId: scope.userId, approvedByUserId: dto.classification === 'POR_VERIFICAR' ? null : scope.userId,
      });
      const cobrada = dto.classification === 'COBRADA';
      const sale = await tx.sale.create({
        data: {
          branchId, stayId: dto.stayId ?? null, cashSessionId: session.id,
          total, status: cobrada ? 'PAID' : 'OPEN',
          unregistered: true, verifyStatus, customerName: noteBase, createdByUserId: scope.userId,
          items: { create: [{ productId: dto.productId, description: noteBase, quantity: dto.quantity, unitPrice: dto.unitPrice, unitCost, subtotal: total }] },
          // COBRADA: registra el pago con su medio y código (si es virtual) en el turno de origen.
          ...(cobrada && dto.method
            ? { payments: { create: [{ branchId, method: dto.method, amount: total, reference: dto.reference?.trim() || null, cashSessionId: session.id, createdByUserId: scope.userId }] } }
            : {}),
        },
      });
      // Si la caja estaba CERRADA pasa a AJUSTADA (conserva su cierre) con huella de auditoría.
      // Si ya estaba AJUSTADA, permanece AJUSTADA (el updateMany solo afecta CLOSED).
      if (session.status !== 'OPEN') {
        await tx.cashIntervention.create({
          data: {
            branchId, cashSessionId: session.id, type: 'UNREGISTERED_SALE', targetKind: 'SALE', targetId: sale.id,
            beforeJson: null,
            afterJson: JSON.stringify({ productId: dto.productId, quantity: dto.quantity, total, classification: dto.classification, method: cobrada ? dto.method : null }),
            reason: noteBase, createdByUserId: scope.userId,
          },
        });
        await tx.cashSession.updateMany({ where: { id: session.id, status: 'CLOSED' }, data: { status: 'AJUSTADA' } });
      }
      return { saleId: sale.id, movementId: mv.id };
    }).catch((err) => {
      if (err instanceof Error && err.message === 'STOCK_INSUFFICIENT') throw new ValidationError('Stock insuficiente para descontar el producto');
      throw err as Error;
    });
    return result;
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
