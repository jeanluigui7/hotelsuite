import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { productWarehouses } from '../../shared/product-kardex';
import { recordActivity } from '../activity-log/activity.emitter';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const submitReviewSchema = z.object({
  lines: z.array(z.object({ productId: z.string().min(1), foundQty: z.coerce.number().int().min(0) })).min(1),
  origin: z.enum(['RECEPCION', 'HOUSEKEEPING']).default('RECEPCION'),
  note: z.string().max(300).optional().or(z.literal('')),
});
export type SubmitReviewDto = z.infer<typeof submitReviewSchema>;

// Reposición parcial: se repone desde UN almacén (Recepción o Limpieza) lo que haya disponible.
// Lo que no se logra reponer queda pendiente por línea; la habitación NO se bloquea.
export const repositionSchema = z.object({
  origin: z.enum(['RECEPCION', 'LIMPIEZA']).default('RECEPCION'),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
});
export type RepositionDto = z.infer<typeof repositionSchema>;

/** Estancia + habitación (valida sucursal y frigobar activo). */
async function stayRoom(scope: RequestScope, stayId: string) {
  const branchId = requireActiveBranch(scope);
  const stay = await prisma.stay.findUnique({ where: { id: stayId } });
  if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
  const room = await prisma.room.findUnique({ where: { id: stay.roomId }, select: { id: true, number: true, roomTypeId: true, frigobarEnabled: true } });
  return { branchId, stay, room };
}

export const frigobarReviewService = {
  /** Datos para el modal de revisión: dotación actual del frigobar (RoomInventory FRIGOBAR) + precios. */
  async start(scope: RequestScope, stayId: string) {
    const { branchId, room } = await stayRoom(scope, stayId);
    if (!room?.frigobarEnabled) throw new ValidationError('Esta habitación no tiene frigobar activo.');
    const inv = await prisma.roomInventory.findMany({ where: { roomId: room.id, articleKind: 'FRIGOBAR' }, select: { productId: true, name: true, quantity: true } });
    const pids = inv.map((i) => i.productId).filter((x): x is string => !!x);
    const [prods, dot] = await Promise.all([
      pids.length ? prisma.product.findMany({ where: { id: { in: pids }, branchId }, select: { id: true, name: true, salePrice: true, imageUrl: true, sku: true } }) : Promise.resolve([]),
      // Ubicación (FRIGOBAR|BANDEJA) guardada en el campo `size` de la Dotación Base de frigobar.
      prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId: room.roomTypeId, articleKind: 'FRIGOBAR', status: 'active', productId: { not: null } }, select: { productId: true, size: true } }),
    ]);
    const pmap = new Map(prods.map((p) => [p.id, p]));
    const locByProd = new Map(dot.map((d) => [d.productId as string, (d.size || 'FRIGOBAR').toUpperCase() === 'BANDEJA' ? 'BANDEJA' : 'FRIGOBAR']));
    const lines = inv.filter((i) => i.productId).map((i) => ({
      productId: i.productId as string,
      name: pmap.get(i.productId as string)?.name ?? i.name,
      code: pmap.get(i.productId as string)?.sku ?? '',
      imageUrl: pmap.get(i.productId as string)?.imageUrl ?? null,
      location: locByProd.get(i.productId as string) ?? 'FRIGOBAR',
      expectedQty: i.quantity,
      unitPrice: Number(pmap.get(i.productId as string)?.salePrice ?? 0),
    }));
    // Orden por CÓDIGO (no alfabético) dentro de cada sección; el frontend agrupa BANDEJA/FRIGOBAR preservando este orden.
    lines.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
    return { room: { id: room.id, number: room.number }, lines };
  },

  /** Registra la revisión: lo faltante (dotación − contado) = consumido → descuenta el frigobar de la
   *  habitación y crea el cargo (venta OPEN ligada a la estancia). Deja reposición pendiente. */
  async submit(scope: RequestScope, stayId: string, dto: SubmitReviewDto) {
    const { branchId, room } = await stayRoom(scope, stayId);
    if (!room?.frigobarEnabled) throw new ValidationError('Esta habitación no tiene frigobar activo.');
    const inv = await prisma.roomInventory.findMany({ where: { roomId: room.id, articleKind: 'FRIGOBAR' } });
    const invByProd = new Map(inv.filter((i) => i.productId).map((i) => [i.productId as string, i]));
    const pids = [...invByProd.keys()];
    const prods = pids.length ? await prisma.product.findMany({ where: { id: { in: pids }, branchId }, select: { id: true, name: true, salePrice: true } }) : [];
    const pmap = new Map(prods.map((p) => [p.id, p]));

    const lines = dto.lines
      .filter((l) => invByProd.has(l.productId))
      .map((l) => {
        const row = invByProd.get(l.productId)!;
        const expected = row.quantity;
        const found = Math.max(0, Math.min(l.foundQty, expected));
        const consumed = expected - found;
        const unitPrice = Number(pmap.get(l.productId)?.salePrice ?? 0);
        return { productId: l.productId, name: pmap.get(l.productId)?.name ?? row.name, expected, found, consumed, unitPrice, amount: round2(consumed * unitPrice) };
      });
    const consumedLines = lines.filter((l) => l.consumed > 0);
    const consumedTotal = round2(consumedLines.reduce((a, l) => a + l.amount, 0));
    const now = new Date();

    const reviewId = await prisma.$transaction(async (tx) => {
      let saleId: string | null = null;
      if (consumedTotal > 0) {
        // Cargo del consumo: venta OPEN ligada a la estancia (aparece en el folio y la paga /stays/:id/pay).
        const sale = await tx.sale.create({
          data: {
            branchId, stayId, status: 'OPEN', total: consumedTotal, createdByUserId: scope.userId,
            items: { create: consumedLines.map((l) => ({ productId: l.productId, description: `Frigobar: ${l.name}`, quantity: l.consumed, unitPrice: l.unitPrice, subtotal: l.amount })) },
          },
        });
        saleId = sale.id;
        // Descuenta el frigobar de la habitación (lo consumido sale).
        for (const l of consumedLines) {
          const key = { roomId_articleKind_name: { roomId: room.id, articleKind: 'FRIGOBAR', name: l.name } };
          const ex = await tx.roomInventory.findUnique({ where: key });
          const left = Math.max(0, (ex?.quantity ?? 0) - l.consumed);
          if (ex) await tx.roomInventory.update({ where: key, data: { quantity: left } });
          await tx.roomInventoryMovement.create({ data: { branchId, roomId: room.id, type: 'CONSUMO', articleKind: 'FRIGOBAR', name: l.name, quantity: -l.consumed, fromLocation: `Habitación ${room.number}`, toLocation: 'Consumo huésped', reference: 'Consumo de frigobar', createdByUserId: scope.userId } });
        }
      }
      const review = await tx.frigobarReview.create({
        data: {
          branchId, stayId, roomId: room.id, status: consumedTotal > 0 ? 'CHARGED' : 'REVIEWED', origin: dto.origin,
          reviewedByUserId: scope.userId, reviewedAt: now, saleId, consumedTotal, repositionPending: consumedTotal > 0,
          lines: { create: lines.map((l) => ({ productId: l.productId, name: l.name, expectedQty: l.expected, foundQty: l.found, consumedQty: l.consumed, unitPrice: l.unitPrice, amount: l.amount })) },
        },
      });
      return review.id;
    });

    void recordActivity(scope, {
      activity: 'FRIGOBAR', area: 'VENTAS', roomId: room.id, entityId: stayId,
      reference: `Hab. ${room.number}`,
      detail: consumedTotal > 0 ? `Frigobar revisado · consumo S/ ${consumedTotal.toFixed(2)} (${consumedLines.length} ítem(s))` : 'Frigobar revisado · sin consumo',
      meta: { stayId, consumedTotal, items: consumedLines.map((l) => ({ name: l.name, qty: l.consumed })) },
    });
    return { reviewId, consumedTotal };
  },

  /** Resuelve el almacén origen por nombre lógico (RECEPCION = general de productos; LIMPIEZA). */
  async originWarehouse(branchId: string, origin: 'RECEPCION' | 'LIMPIEZA') {
    const { general, limpieza } = await productWarehouses(branchId);
    return origin === 'LIMPIEZA' ? limpieza : general;
  },

  /**
   * Datos para el modal de reposición: líneas pendientes (consumido − repuesto) + disponibilidad
   * de cada producto en AMBOS almacenes (Recepción/Limpieza) para pintar los badges de stock.
   */
  async repositionStart(scope: RequestScope, reviewId: string) {
    const branchId = requireActiveBranch(scope);
    const review = await prisma.frigobarReview.findUnique({ where: { id: reviewId }, include: { lines: true } });
    if (!review || review.branchId !== branchId) throw new NotFoundError('Revisión no encontrada');
    const room = await prisma.room.findUnique({ where: { id: review.roomId }, select: { id: true, number: true } });
    const { general, limpieza } = await productWarehouses(branchId);
    const pending = review.lines
      .map((l) => ({ productId: l.productId, name: l.name, pendingQty: Math.max(0, l.consumedQty - l.repositionedQty) }))
      .filter((l) => l.pendingQty > 0);
    const pids = pending.map((l) => l.productId);
    const [prods, stocks] = await Promise.all([
      pids.length ? prisma.product.findMany({ where: { id: { in: pids }, branchId }, select: { id: true, imageUrl: true } }) : Promise.resolve([]),
      pids.length
        ? prisma.stock.findMany({ where: { productId: { in: pids }, warehouseId: { in: [general?.id, limpieza?.id].filter((x): x is string => !!x) } }, select: { productId: true, warehouseId: true, quantity: true } })
        : Promise.resolve([]),
    ]);
    const img = new Map(prods.map((p) => [p.id, p.imageUrl]));
    const availOf = (pid: string, whId?: string | null) => (whId ? stocks.find((s) => s.productId === pid && s.warehouseId === whId)?.quantity ?? 0 : 0);
    const lines = pending.map((l) => ({
      productId: l.productId,
      name: l.name,
      imageUrl: img.get(l.productId) ?? null,
      pendingQty: l.pendingQty,
      availRecepcion: availOf(l.productId, general?.id),
      availLimpieza: availOf(l.productId, limpieza?.id),
    }));
    return {
      reviewId: review.id,
      room: { id: room?.id, number: room?.number ?? '' },
      warehouses: { recepcion: general ? { id: general.id, name: general.name } : null, limpieza: limpieza ? { id: limpieza.id, name: limpieza.name } : null },
      lines,
    };
  },

  /**
   * Reposición PARCIAL desde un almacén (Recepción o Limpieza). Repone hasta lo disponible por
   * producto; lo que falte queda pendiente por línea (NO bloquea la habitación). El descuento del
   * almacén origen se registra como AJUSTE «Transferencia interna» (no es venta, no toca caja).
   */
  async reposition(scope: RequestScope, reviewId: string, dto: RepositionDto) {
    const branchId = requireActiveBranch(scope);
    const review = await prisma.frigobarReview.findUnique({ where: { id: reviewId }, include: { lines: true } });
    if (!review || review.branchId !== branchId) throw new NotFoundError('Revisión no encontrada');
    if (!review.repositionPending) throw new ValidationError('Esta revisión no tiene reposición pendiente.');
    const wh = await this.originWarehouse(branchId, dto.origin);
    if (!wh) throw new ValidationError(`No existe el almacén ${dto.origin === 'LIMPIEZA' ? 'Productos Limpieza' : 'Productos Recepción'} para reponer.`);
    const room = await prisma.room.findUnique({ where: { id: review.roomId }, select: { number: true } });
    const originLabel = dto.origin === 'LIMPIEZA' ? 'Productos Limpieza' : 'Productos Recepción';
    const lineByProd = new Map(review.lines.map((l) => [l.productId, l]));
    const now = new Date();

    const done: { name: string; qty: number }[] = [];
    await prisma.$transaction(async (tx) => {
      for (const req of dto.lines) {
        const l = lineByProd.get(req.productId);
        if (!l) continue;
        const pending = Math.max(0, l.consumedQty - l.repositionedQty);
        if (pending <= 0) continue;
        const st = await tx.stock.findFirst({ where: { productId: l.productId, warehouseId: wh.id } });
        const avail = st?.quantity ?? 0;
        // Reposición parcial: se repone lo posible (pedido acotado a pendiente y a disponible). Sin stock → se omite.
        const qty = Math.min(req.quantity, pending, avail);
        if (qty <= 0) continue;
        await tx.stock.update({ where: { id: st!.id }, data: { quantity: { decrement: qty } } });
        const key = { roomId_articleKind_name: { roomId: review.roomId, articleKind: 'FRIGOBAR', name: l.name } };
        const ex = await tx.roomInventory.findUnique({ where: key });
        await tx.roomInventory.upsert({ where: key, update: { quantity: (ex?.quantity ?? 0) + qty, productId: l.productId }, create: { branchId, roomId: review.roomId, articleKind: 'FRIGOBAR', name: l.name, productId: l.productId, quantity: qty } });
        await tx.roomInventoryMovement.create({ data: { branchId, roomId: review.roomId, type: 'REPOSICION', articleKind: 'FRIGOBAR', name: l.name, quantity: qty, fromLocation: originLabel, toLocation: `Habitación ${room?.number ?? ''}`, reference: 'Reposición de frigobar', createdByUserId: scope.userId } });
        // AJUSTE «Transferencia interna»: baja el stock del almacén origen sin cruzarse con ventas ni caja.
        await tx.inventoryMovement.create({ data: { branchId, productId: l.productId, warehouseId: wh.id, type: 'TRANSFER', adjustType: 'TRANSFER', quantity: -qty, reference: `Transferencia interna — reposición frigobar Hab. ${room?.number ?? ''}`, roomId: review.roomId, createdByUserId: scope.userId } });
        await tx.frigobarReviewLine.update({ where: { id: l.id }, data: { repositionedQty: l.repositionedQty + qty } });
        l.repositionedQty += qty; // refleja en memoria para recomputar el pendiente
        done.push({ name: l.name, qty });
      }
      const stillPending = review.lines.some((l) => l.consumedQty - l.repositionedQty > 0);
      await tx.frigobarReview.update({ where: { id: reviewId }, data: { repositionPending: stillPending, repositionDoneAt: stillPending ? null : now } });
    });

    const pendingLeft = review.lines
      .map((l) => ({ name: l.name, qty: Math.max(0, l.consumedQty - l.repositionedQty) }))
      .filter((l) => l.qty > 0);
    if (done.length) {
      // Ticket de reposición para la cola de impresión (QZ / navegador).
      await prisma.printJob.create({
        data: { branchId, type: 'REPOSICION', title: `Reposición frigobar Hab. ${room?.number ?? ''} (${done.length} ítems)`, payload: JSON.stringify({ room: room?.number ?? '', origin: originLabel, items: done }), status: 'PENDING' },
      });
      void recordActivity(scope, {
        activity: 'FRIGOBAR', area: 'INVENTARIO', roomId: review.roomId, entityId: review.stayId, reference: `Hab. ${room?.number ?? ''}`,
        detail: `Frigobar repuesto desde ${originLabel} · ${done.length} ítem(s)${pendingLeft.length ? ` · ${pendingLeft.length} pendiente(s)` : ''}`,
        meta: { stayId: review.stayId, reposition: true, origin: dto.origin, done, pendingLeft },
      });
    }
    return { ok: true, repuesto: done, pendiente: pendingLeft, repositionPending: pendingLeft.length > 0 };
  },

  /** Reposiciones de frigobar pendientes por habitación (para el rack: card «FRIGOBAR INCOMPLETO»). */
  async pendingRepositionByRoom(branchId: string, roomIds: string[]) {
    const map = new Map<string, { reviewId: string; stayId: string; pending: { name: string; qty: number }[] }>();
    if (!roomIds.length) return map;
    const reviews = await prisma.frigobarReview.findMany({
      where: { branchId, roomId: { in: roomIds }, repositionPending: true },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const rv of reviews) {
      if (map.has(rv.roomId)) continue; // la revisión más reciente por habitación manda
      const pending = rv.lines
        .map((l) => ({ name: l.name, qty: Math.max(0, l.consumedQty - l.repositionedQty) }))
        .filter((l) => l.qty > 0);
      if (pending.length) map.set(rv.roomId, { reviewId: rv.id, stayId: rv.stayId, pending });
    }
    return map;
  },

  /** Estado del frigobar para el folio (SIN_REVISAR / REVISADO / CONSUMO_REGISTRADO / PAGADO). */
  async stateForStay(branchId: string, stayId: string, roomFrigobarEnabled: boolean) {
    if (!roomFrigobarEnabled) return { enabled: false, status: 'NO_APLICA' as const };
    const review = await prisma.frigobarReview.findFirst({ where: { branchId, stayId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
    if (!review) return { enabled: true, status: 'SIN_REVISAR' as const };
    const reviewer = review.reviewedByUserId ? (await prisma.user.findUnique({ where: { id: review.reviewedByUserId }, select: { name: true } }))?.name ?? null : null;
    // Faltantes de reposición por línea (consumido − repuesto): alimenta el badge/lista «FRIGOBAR INCOMPLETO».
    const repositionPendingLines = review.lines
      .map((l) => ({ name: l.name, qty: Math.max(0, l.consumedQty - l.repositionedQty) }))
      .filter((l) => l.qty > 0);
    const base = { enabled: true, reviewId: review.id, reviewedBy: reviewer, reviewedAt: review.reviewedAt, repositionPending: review.repositionPending, repositionPendingLines };
    if (review.status !== 'CHARGED') return { ...base, status: 'REVISADO' as const };
    const consumido = Number(review.consumedTotal);
    let pagado = 0;
    if (review.saleId) {
      const pays = await prisma.payment.findMany({ where: { saleId: review.saleId }, select: { amount: true } });
      pagado = round2(pays.reduce((a, p) => a + Number(p.amount), 0));
    }
    const pendiente = round2(Math.max(0, consumido - pagado));
    const lines = review.lines.filter((l) => l.consumedQty > 0).map((l) => ({ name: l.name, quantity: l.consumedQty, amount: Number(l.amount) }));
    return { ...base, status: pendiente <= 0.001 ? ('PAGADO' as const) : ('CONSUMO_REGISTRADO' as const), lines, consumido, pagado, pendiente };
  },
};
