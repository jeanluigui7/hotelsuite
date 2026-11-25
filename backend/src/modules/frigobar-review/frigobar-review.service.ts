import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { requireCleaningShiftIfCleaner } from '../../shared/cleaning-shift';
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

  /** Stock ACTUAL del frigobar de una habitación (solo lectura; para la card de la habitación, todos los usuarios). */
  async roomStock(scope: RequestScope, roomId: string) {
    const branchId = requireActiveBranch(scope);
    const room = await prisma.room.findFirst({ where: { id: roomId, branchId }, select: { id: true, number: true, roomTypeId: true, frigobarEnabled: true } });
    if (!room) throw new ValidationError('Habitación no encontrada');
    const inv = await prisma.roomInventory.findMany({ where: { roomId: room.id, articleKind: 'FRIGOBAR' }, select: { productId: true, name: true, quantity: true } });
    const pids = inv.map((i) => i.productId).filter((x): x is string => !!x);
    const [prods, dot] = await Promise.all([
      pids.length ? prisma.product.findMany({ where: { id: { in: pids }, branchId }, select: { id: true, name: true, salePrice: true, imageUrl: true, sku: true } }) : Promise.resolve([]),
      prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId: room.roomTypeId, articleKind: 'FRIGOBAR', status: 'active', productId: { not: null } }, select: { productId: true, size: true } }),
    ]);
    const pmap = new Map(prods.map((p) => [p.id, p]));
    const locByProd = new Map(dot.map((d) => [d.productId as string, (d.size || 'FRIGOBAR').toUpperCase() === 'BANDEJA' ? 'BANDEJA' : 'FRIGOBAR']));
    const items = inv.map((i) => ({
      productId: i.productId,
      name: pmap.get(i.productId as string)?.name ?? i.name,
      code: pmap.get(i.productId as string)?.sku ?? '',
      imageUrl: pmap.get(i.productId as string)?.imageUrl ?? null,
      location: (i.productId ? locByProd.get(i.productId) : null) ?? 'FRIGOBAR',
      quantity: i.quantity,
      unitPrice: Number(pmap.get(i.productId as string)?.salePrice ?? 0),
    }));
    items.sort((a, b) => (a.location === b.location ? a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }) : a.location === 'BANDEJA' ? -1 : 1));
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    return { room: { id: room.id, number: room.number, frigobarEnabled: room.frigobarEnabled }, items, totalUnits };
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

  /** Resuelve el almacén origen: RECEPCION = almacén de Recepción (tipo RECEPTION, el de
   *  /operations/inventario-recepcion); LIMPIEZA = Productos Limpieza. */
  async originWarehouse(branchId: string, origin: 'RECEPCION' | 'LIMPIEZA') {
    if (origin === 'LIMPIEZA') return (await productWarehouses(branchId)).limpieza;
    return prisma.warehouse.findFirst({ where: { branchId, type: 'RECEPTION' }, select: { id: true, name: true } });
  },

  /**
   * Faltantes de reposición ACUMULADOS por habitación (persisten entre inspecciones/alquileres):
   * todas las revisiones con reposición pendiente (más antigua primero) + el pendiente agregado por
   * producto. Base de la trazabilidad: nada se reinicia, cada faltante vive en su línea original.
   */
  async roomPendingReviews(branchId: string, roomId: string) {
    const reviews = await prisma.frigobarReview.findMany({
      where: { branchId, roomId, repositionPending: true },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
    const agg = new Map<string, { productId: string | null; name: string; pendingQty: number }>();
    for (const rv of reviews) {
      for (const l of rv.lines) {
        const pend = Math.max(0, l.consumedQty - l.repositionedQty);
        if (pend <= 0) continue;
        const key = l.productId ?? `name:${l.name}`;
        const cur = agg.get(key);
        if (cur) cur.pendingQty += pend;
        else agg.set(key, { productId: l.productId, name: l.name, pendingQty: pend });
      }
    }
    return { reviews, pending: [...agg.values()].filter((p) => p.pendingQty > 0) };
  },

  /**
   * Datos para el modal de reposición: líneas pendientes ACUMULADAS de toda la habitación
   * (consumido − repuesto, sumado entre revisiones) + disponibilidad de cada producto en AMBOS
   * almacenes (Recepción/Limpieza) para pintar los badges de stock.
   */
  async repositionStart(scope: RequestScope, reviewId: string) {
    const branchId = requireActiveBranch(scope);
    const review = await prisma.frigobarReview.findUnique({ where: { id: reviewId }, select: { id: true, branchId: true, roomId: true } });
    if (!review || review.branchId !== branchId) throw new NotFoundError('Revisión no encontrada');
    const room = await prisma.room.findUnique({ where: { id: review.roomId }, select: { id: true, number: true } });
    const [recepcion, { limpieza }] = await Promise.all([
      prisma.warehouse.findFirst({ where: { branchId, type: 'RECEPTION' }, select: { id: true, name: true } }),
      productWarehouses(branchId),
    ]);
    // Pendiente agregado de TODA la habitación (no solo de esta revisión): acumula faltantes.
    const { pending } = await this.roomPendingReviews(branchId, review.roomId);
    const pids = pending.map((l) => l.productId).filter((x): x is string => !!x);
    const [prods, stocks] = await Promise.all([
      pids.length ? prisma.product.findMany({ where: { id: { in: pids }, branchId }, select: { id: true, imageUrl: true } }) : Promise.resolve([]),
      pids.length
        ? prisma.stock.findMany({ where: { productId: { in: pids }, warehouseId: { in: [recepcion?.id, limpieza?.id].filter((x): x is string => !!x) } }, select: { productId: true, warehouseId: true, quantity: true } })
        : Promise.resolve([]),
    ]);
    const img = new Map(prods.map((p) => [p.id, p.imageUrl]));
    const availOf = (pid: string, whId?: string | null) => (whId ? stocks.find((s) => s.productId === pid && s.warehouseId === whId)?.quantity ?? 0 : 0);
    const lines = pending
      .filter((l): l is { productId: string; name: string; pendingQty: number } => !!l.productId)
      .map((l) => ({
        productId: l.productId,
        name: l.name,
        imageUrl: img.get(l.productId) ?? null,
        pendingQty: l.pendingQty,
        availRecepcion: availOf(l.productId, recepcion?.id),
        availLimpieza: availOf(l.productId, limpieza?.id),
      }));
    return {
      reviewId: review.id,
      room: { id: room?.id, number: room?.number ?? '' },
      warehouses: { recepcion: recepcion ? { id: recepcion.id, name: recepcion.name } : null, limpieza: limpieza ? { id: limpieza.id, name: limpieza.name } : null },
      lines,
    };
  },

  /**
   * Reposición PARCIAL desde un almacén (Recepción o Limpieza). Repone hasta lo disponible por
   * producto; lo que falte queda pendiente por línea (NO bloquea la habitación). El descuento del
   * almacén origen se registra como AJUSTE «Transferencia interna» (no es venta, no toca caja).
   *
   * Opera sobre el pendiente ACUMULADO de toda la habitación: por cada producto, drena las líneas
   * pendientes de la más antigua a la más nueva (oldest-first). Así una reposición parcial NO borra
   * faltantes anteriores — solo descuenta lo efectivamente repuesto — y la trazabilidad se conserva
   * (cada línea original guarda cuánto se repuso de ella).
   */
  async reposition(scope: RequestScope, reviewId: string, dto: RepositionDto) {
    await requireCleaningShiftIfCleaner(scope);
    const branchId = requireActiveBranch(scope);
    const entry = await prisma.frigobarReview.findUnique({ where: { id: reviewId }, select: { id: true, branchId: true, roomId: true } });
    if (!entry || entry.branchId !== branchId) throw new NotFoundError('Revisión no encontrada');
    const { reviews } = await this.roomPendingReviews(branchId, entry.roomId);
    if (!reviews.length) throw new ValidationError('Esta habitación no tiene reposición pendiente.');
    const wh = await this.originWarehouse(branchId, dto.origin);
    if (!wh) throw new ValidationError(`No existe el almacén ${dto.origin === 'LIMPIEZA' ? 'Productos Limpieza' : 'Productos Recepción'} para reponer.`);
    const room = await prisma.room.findUnique({ where: { id: entry.roomId }, select: { number: true } });
    const originLabel = dto.origin === 'LIMPIEZA' ? 'Productos Limpieza' : 'Productos Recepción';
    const now = new Date();

    // productId → líneas pendientes de TODAS las revisiones de la habitación (oldest-first: `reviews`
    // viene ordenado asc). Se referencian los objetos reales de `rv.lines` para recomputar el pendiente.
    const linesByProd = new Map<string, (typeof reviews)[number]['lines']>();
    for (const rv of reviews) {
      for (const l of rv.lines) {
        if (!l.productId || l.consumedQty - l.repositionedQty <= 0) continue;
        const arr = linesByProd.get(l.productId) ?? [];
        arr.push(l);
        linesByProd.set(l.productId, arr);
      }
    }

    const done: { name: string; qty: number }[] = [];
    await prisma.$transaction(async (tx) => {
      for (const req of dto.lines) {
        const arr = linesByProd.get(req.productId);
        if (!arr || !arr.length) continue;
        const st = await tx.stock.findFirst({ where: { productId: req.productId, warehouseId: wh.id } });
        let avail = st?.quantity ?? 0;
        if (avail <= 0) continue;
        let want = Math.max(0, Math.floor(req.quantity));
        const name = arr[0].name;
        let movedForProduct = 0;
        // Drena oldest-first: cada unidad repuesta descuenta la línea pendiente más antigua primero.
        for (const l of arr) {
          if (want <= 0 || avail <= 0) break;
          const linePending = l.consumedQty - l.repositionedQty;
          if (linePending <= 0) continue;
          const qty = Math.min(want, linePending, avail);
          if (qty <= 0) continue;
          await tx.frigobarReviewLine.update({ where: { id: l.id }, data: { repositionedQty: l.repositionedQty + qty } });
          l.repositionedQty += qty; // muta el objeto real → el recómputo de repositionPending lo ve
          want -= qty; avail -= qty; movedForProduct += qty;
        }
        if (movedForProduct <= 0) continue;
        // Descuenta el almacén origen una sola vez por producto (total efectivamente repuesto).
        await tx.stock.update({ where: { id: st!.id }, data: { quantity: { decrement: movedForProduct } } });
        const key = { roomId_articleKind_name: { roomId: entry.roomId, articleKind: 'FRIGOBAR', name } };
        const ex = await tx.roomInventory.findUnique({ where: key });
        await tx.roomInventory.upsert({ where: key, update: { quantity: (ex?.quantity ?? 0) + movedForProduct, productId: req.productId }, create: { branchId, roomId: entry.roomId, articleKind: 'FRIGOBAR', name, productId: req.productId, quantity: movedForProduct } });
        await tx.roomInventoryMovement.create({ data: { branchId, roomId: entry.roomId, type: 'REPOSICION', articleKind: 'FRIGOBAR', name, quantity: movedForProduct, fromLocation: originLabel, toLocation: `Habitación ${room?.number ?? ''}`, reference: 'Reposición de frigobar', createdByUserId: scope.userId } });
        // AJUSTE «Transferencia interna»: baja el stock del almacén origen sin cruzarse con ventas ni caja.
        await tx.inventoryMovement.create({ data: { branchId, productId: req.productId, warehouseId: wh.id, type: 'TRANSFER', adjustType: 'TRANSFER', quantity: -movedForProduct, reference: `Reposición frigobar Hab. ${room?.number ?? ''}`, roomId: entry.roomId, createdByUserId: scope.userId } });
        done.push({ name, qty: movedForProduct });
      }
      // Recalcula el flag de cada revisión tocada (sin reiniciar nada: solo refleja lo que quedó).
      for (const rv of reviews) {
        const stillPending = rv.lines.some((l) => l.consumedQty - l.repositionedQty > 0);
        await tx.frigobarReview.update({ where: { id: rv.id }, data: { repositionPending: stillPending, repositionDoneAt: stillPending ? null : (rv.repositionDoneAt ?? now) } });
      }
    });

    // Pendiente restante ACUMULADO de la habitación (todos los productos, todas las revisiones).
    const pendingLeftMap = new Map<string, number>();
    for (const rv of reviews) for (const l of rv.lines) {
      const q = Math.max(0, l.consumedQty - l.repositionedQty);
      if (q > 0) pendingLeftMap.set(l.name, (pendingLeftMap.get(l.name) ?? 0) + q);
    }
    const pendingLeft = [...pendingLeftMap.entries()].map(([name, qty]) => ({ name, qty }));
    if (done.length) {
      // Ticket de reposición para la cola de impresión (QZ / navegador).
      await prisma.printJob.create({
        data: { branchId, type: 'REPOSICION', title: `Reposición frigobar Hab. ${room?.number ?? ''} (${done.length} ítems)`, payload: JSON.stringify({ room: room?.number ?? '', origin: originLabel, items: done }), status: 'PENDING' },
      });
      void recordActivity(scope, {
        activity: 'FRIGOBAR', area: 'INVENTARIO', roomId: entry.roomId, entityId: reviews[0]?.stayId ?? '', reference: `Hab. ${room?.number ?? ''}`,
        detail: `Frigobar repuesto desde ${originLabel} · ${done.length} ítem(s)${pendingLeft.length ? ` · ${pendingLeft.length} pendiente(s)` : ''}`,
        meta: { reposition: true, origin: dto.origin, done, pendingLeft },
      });
    }
    return { ok: true, repuesto: done, pendiente: pendingLeft, repositionPending: pendingLeft.length > 0 };
  },

  /** Reposiciones de frigobar pendientes por habitación (para el rack: card «FRIGOBAR INCOMPLETO»).
   *  Acumula el pendiente de TODAS las revisiones de cada habitación (no solo la última), agrupado
   *  por producto. `reviewId` apunta a la revisión pendiente más antigua (punto de entrada del modal). */
  async pendingRepositionByRoom(branchId: string, roomIds: string[]) {
    const map = new Map<string, { reviewId: string; stayId: string; pending: { name: string; qty: number }[] }>();
    if (!roomIds.length) return map;
    const reviews = await prisma.frigobarReview.findMany({
      where: { branchId, roomId: { in: roomIds }, repositionPending: true },
      include: { lines: true },
      orderBy: { createdAt: 'asc' }, // más antigua primero: fija el reviewId de entrada y el orden de drenado
    });
    for (const rv of reviews) {
      let entry = map.get(rv.roomId);
      if (!entry) { entry = { reviewId: rv.id, stayId: rv.stayId, pending: [] }; map.set(rv.roomId, entry); }
      for (const l of rv.lines) {
        const qty = Math.max(0, l.consumedQty - l.repositionedQty);
        if (qty <= 0) continue;
        const ex = entry.pending.find((p) => p.name === l.name);
        if (ex) ex.qty += qty;
        else entry.pending.push({ name: l.name, qty });
      }
    }
    // Descarta habitaciones cuyo pendiente agregado quedó en cero (revisiones marcadas pero ya saldadas).
    for (const [roomId, entry] of map) if (!entry.pending.length) map.delete(roomId);
    return map;
  },

  /** Estado del frigobar para el folio (SIN_REVISAR / REVISADO / CONSUMO_REGISTRADO / PAGADO). */
  async stateForStay(branchId: string, stayId: string, roomFrigobarEnabled: boolean) {
    if (!roomFrigobarEnabled) return { enabled: false, status: 'NO_APLICA' as const };
    const stay = await prisma.stay.findUnique({ where: { id: stayId }, select: { roomId: true } });
    // Faltantes de reposición ACUMULADOS por HABITACIÓN (no por estancia): persisten entre inspecciones
    // y sobreviven a nuevos alquileres/check-outs. `repositionReviewId` = revisión pendiente más antigua.
    const roomPending = stay?.roomId ? await this.roomPendingReviews(branchId, stay.roomId) : { reviews: [], pending: [] };
    const repositionPendingLines = roomPending.pending.map((p) => ({ name: p.name, qty: p.pendingQty }));
    const repositionPending = repositionPendingLines.length > 0;
    const repositionReviewId = roomPending.reviews[0]?.id ?? null;
    const repoBase = { repositionPending, repositionPendingLines, repositionReviewId };

    const review = await prisma.frigobarReview.findFirst({ where: { branchId, stayId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
    if (!review) return { enabled: true, status: 'SIN_REVISAR' as const, ...repoBase };
    const reviewer = review.reviewedByUserId ? (await prisma.user.findUnique({ where: { id: review.reviewedByUserId }, select: { name: true } }))?.name ?? null : null;
    const base = { enabled: true, reviewId: review.id, reviewedBy: reviewer, reviewedAt: review.reviewedAt, ...repoBase };
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
