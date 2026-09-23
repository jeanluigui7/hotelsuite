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
  note: z.string().max(300).optional().or(z.literal('')),
});
export type SubmitReviewDto = z.infer<typeof submitReviewSchema>;

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
      pids.length ? prisma.product.findMany({ where: { id: { in: pids }, branchId }, select: { id: true, name: true, salePrice: true, imageUrl: true } }) : Promise.resolve([]),
      // Ubicación (FRIGOBAR|BANDEJA) guardada en el campo `size` de la Dotación Base de frigobar.
      prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId: room.roomTypeId, articleKind: 'FRIGOBAR', status: 'active', productId: { not: null } }, select: { productId: true, size: true } }),
    ]);
    const pmap = new Map(prods.map((p) => [p.id, p]));
    const locByProd = new Map(dot.map((d) => [d.productId as string, (d.size || 'FRIGOBAR').toUpperCase() === 'BANDEJA' ? 'BANDEJA' : 'FRIGOBAR']));
    const lines = inv.filter((i) => i.productId).map((i) => ({
      productId: i.productId as string,
      name: pmap.get(i.productId as string)?.name ?? i.name,
      imageUrl: pmap.get(i.productId as string)?.imageUrl ?? null,
      location: locByProd.get(i.productId as string) ?? 'FRIGOBAR',
      expectedQty: i.quantity,
      unitPrice: Number(pmap.get(i.productId as string)?.salePrice ?? 0),
    }));
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
          branchId, stayId, roomId: room.id, status: consumedTotal > 0 ? 'CHARGED' : 'REVIEWED',
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

  /** Reposición: repone lo consumido desde Productos Limpieza al frigobar de la habitación. */
  async reposition(scope: RequestScope, reviewId: string) {
    const branchId = requireActiveBranch(scope);
    const review = await prisma.frigobarReview.findUnique({ where: { id: reviewId }, include: { lines: true } });
    if (!review || review.branchId !== branchId) throw new NotFoundError('Revisión no encontrada');
    if (!review.repositionPending) throw new ValidationError('Esta revisión no tiene reposición pendiente.');
    const { limpieza } = await productWarehouses(branchId);
    if (!limpieza) throw new ValidationError('No existe el almacén Productos Limpieza para reponer.');
    const room = await prisma.room.findUnique({ where: { id: review.roomId }, select: { number: true } });
    const toRepo = review.lines.filter((l) => l.consumedQty > 0);
    await prisma.$transaction(async (tx) => {
      for (const l of toRepo) {
        const st = await tx.stock.findFirst({ where: { productId: l.productId, warehouseId: limpieza.id } });
        if (!st || st.quantity < l.consumedQty) throw new ValidationError(`"${l.name}" insuficiente en Productos Limpieza (disp. ${st?.quantity ?? 0}).`);
        await tx.stock.update({ where: { id: st.id }, data: { quantity: { decrement: l.consumedQty } } });
        const key = { roomId_articleKind_name: { roomId: review.roomId, articleKind: 'FRIGOBAR', name: l.name } };
        const ex = await tx.roomInventory.findUnique({ where: key });
        await tx.roomInventory.upsert({ where: key, update: { quantity: (ex?.quantity ?? 0) + l.consumedQty, productId: l.productId }, create: { branchId, roomId: review.roomId, articleKind: 'FRIGOBAR', name: l.name, productId: l.productId, quantity: l.consumedQty } });
        await tx.roomInventoryMovement.create({ data: { branchId, roomId: review.roomId, type: 'REPOSICION', articleKind: 'FRIGOBAR', name: l.name, quantity: l.consumedQty, fromLocation: 'Productos Limpieza', toLocation: `Habitación ${room?.number ?? ''}`, reference: 'Reposición de frigobar', createdByUserId: scope.userId } });
        await tx.inventoryMovement.create({ data: { branchId, productId: l.productId, warehouseId: limpieza.id, type: 'OUT', quantity: -l.consumedQty, reference: `Reposición frigobar Hab. ${room?.number ?? ''}`, roomId: review.roomId, createdByUserId: scope.userId } });
      }
      await tx.frigobarReview.update({ where: { id: reviewId }, data: { repositionPending: false, repositionDoneAt: new Date() } });
    });
    void recordActivity(scope, { activity: 'FRIGOBAR', area: 'INVENTARIO', roomId: review.roomId, entityId: review.stayId, reference: `Hab. ${room?.number ?? ''}`, detail: `Frigobar repuesto · ${toRepo.length} ítem(s)`, meta: { stayId: review.stayId, reposition: true } });
    return { ok: true };
  },

  /** Estado del frigobar para el folio (SIN_REVISAR / REVISADO / CONSUMO_REGISTRADO / PAGADO). */
  async stateForStay(branchId: string, stayId: string, roomFrigobarEnabled: boolean) {
    if (!roomFrigobarEnabled) return { enabled: false, status: 'NO_APLICA' as const };
    const review = await prisma.frigobarReview.findFirst({ where: { branchId, stayId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
    if (!review) return { enabled: true, status: 'SIN_REVISAR' as const };
    const reviewer = review.reviewedByUserId ? (await prisma.user.findUnique({ where: { id: review.reviewedByUserId }, select: { name: true } }))?.name ?? null : null;
    const base = { enabled: true, reviewId: review.id, reviewedBy: reviewer, reviewedAt: review.reviewedAt, repositionPending: review.repositionPending };
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
