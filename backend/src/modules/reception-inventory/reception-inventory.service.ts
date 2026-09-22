import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { buildProductKardex, productWarehouses } from '../../shared/product-kardex';
import { requireActiveBranch } from '../../shared/scope';
import { requireReceptionFlag } from '../operations-config/operations-config.service';
import { prisma } from '../../config/prisma';
import { notifyAdmin } from '../../shared/notify';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';
import { productsRepository } from '../products/products.repository';

/** Inventario de Recepción: stock en el almacén de recepción, con flujo de
 *  solicitud → envío (admin) → recepción (suma stock), y baja de stock. */

export const requestSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
  notes: z.string().max(300).optional().or(z.literal('')),
});
export const writeOffSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  // VENCIDO / PERDIDO: sale de recepción (merma, queda rastro). SOBRANTE: regresa al almacén general.
  motivo: z.enum(['VENCIDO', 'PERDIDO', 'SOBRANTE']).default('VENCIDO'),
  notes: z.string().max(200).optional().or(z.literal('')),
});
// Envío por ítem (el admin ajusta la cantidad a enviar por producto y elige cuáles).
export const sendItemsSchema = z.object({
  lines: z.array(z.object({ requestId: z.string().min(1), productId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
});
export const deleteItemsSchema = z.object({
  lines: z.array(z.object({ requestId: z.string().min(1), productId: z.string().min(1) })).min(1),
});
export const rejectSchema = z.object({
  reason: z.string().min(1).max(60),
  note: z.string().max(500).optional().or(z.literal('')),
});
export type RequestDto = z.infer<typeof requestSchema>;
export type WriteOffDto = z.infer<typeof writeOffSchema>;
export type SendItemsDto = z.infer<typeof sendItemsSchema>;
export type DeleteItemsDto = z.infer<typeof deleteItemsSchema>;
export type RejectDto = z.infer<typeof rejectSchema>;

async function receptionWarehouseId(branchId: string): Promise<string> {
  let wh = await prisma.warehouse.findFirst({ where: { branchId, type: 'RECEPTION' } });
  if (!wh) wh = await prisma.warehouse.create({ data: { branchId, name: 'Recepción', type: 'RECEPTION' } });
  return wh.id;
}

export const receptionInventoryService = {
  /** Ventana [from, to) del turno de recepción, por la config de Horarios. */
  turnWindow(
    shifts: { shift: string; startTime: string; endTime: string; status: string }[],
    date?: string,
    shift?: string,
  ): { from: Date; to: Date; shift: string; businessDate: string; startTime: string; endTime: string; isCurrent: boolean } {
    const DEF = [
      { shift: 'MANANA', startTime: '06:30', endTime: '14:30', status: 'active' },
      { shift: 'TARDE', startTime: '14:30', endTime: '22:30', status: 'active' },
      { shift: 'NOCHE', startTime: '22:30', endTime: '06:30', status: 'active' },
    ];
    const cfg = shifts.length ? shifts : DEF;
    const toMin = (h: string): number => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
    const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();

    // Turno objetivo: el indicado (date+shift) o el actual por la hora.
    let bizDate = date;
    let shiftKey = shift;
    if (!bizDate || !shiftKey) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const s = cfg.find((x) => {
        if (x.status !== 'active') return false;
        const st = toMin(x.startTime); const en = toMin(x.endTime);
        return en > st ? nowMin >= st && nowMin < en : nowMin >= st || nowMin < en;
      }) ?? cfg[0];
      const st = toMin(s.startTime); const overnight = toMin(s.endTime) <= st;
      const d = new Date(now);
      if (overnight && now.getHours() * 60 + now.getMinutes() < st) d.setDate(d.getDate() - 1);
      bizDate = ymd(d); shiftKey = s.shift;
    }

    const sc = cfg.find((x) => x.shift === shiftKey) ?? cfg[0];
    const [sh, sm] = sc.startTime.split(':').map(Number);
    const [eh, em] = sc.endTime.split(':').map(Number);
    const overnight = eh * 60 + em <= sh * 60 + sm;
    const from = new Date(`${bizDate}T00:00:00`); from.setHours(sh, sm, 0, 0);
    const to = new Date(`${bizDate}T00:00:00`); to.setHours(eh, em, 0, 0); if (overnight) to.setDate(to.getDate() + 1);
    return { from, to, shift: shiftKey, businessDate: bizDate, startTime: sc.startTime, endTime: sc.endTime, isCurrent: now >= from && now < to };
  },

  /**
   * Inventario de recepción de un turno. El stock inicial = stock actual − movimientos
   * desde el inicio del turno (así hereda el stock final del turno anterior, no el base).
   */
  async list(scope: RequestScope, opts?: { date?: string; shift?: string }) {
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const shifts = await prisma.roleShift.findMany({ where: { branchId, role: 'RECEPCION' } });
    const win = this.turnWindow(shifts, opts?.date, opts?.shift);
    const { generalIds } = await productWarehouses(branchId);
    // Solo productos habilitados para Recepción (los exclusivos de Frigobar no forman parte de este stock).
    const items = await buildProductKardex({ branchId, whId, win, generalIds, minField: 'receptionReorderPoint', productWhere: { receptionEnabled: true } });
    return {
      warehouseId: whId,
      turn: { shift: win.shift, businessDate: win.businessDate, startTime: win.startTime, endTime: win.endTime, isCurrent: win.isCurrent, from: win.from, to: win.to },
      items,
    };
  },

  async createRequest(scope: RequestScope, dto: RequestDto) {
    const branchId = requireActiveBranch(scope);
    const created = await prisma.productRequest.create({
      data: {
        branchId,
        status: 'REQUESTED',
        notes: dto.notes || null,
        createdByUserId: scope.userId,
        items: { create: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
      },
      include: { items: true },
    });
    // Aviso al administrador por WhatsApp (best-effort; requiere notify.adminPhone configurado).
    const names = new Map(
      (await prisma.product.findMany({ where: { id: { in: dto.items.map((i) => i.productId) } }, select: { id: true, name: true } }))
        .map((x) => [x.id, x.name] as const),
    );
    const detail = dto.items.map((i) => `${i.quantity}× ${names.get(i.productId) ?? 'producto'}`).join(', ');
    await notifyAdmin(branchId, `📦 RIZZOS · Solicitud de productos de Recepción: ${detail}.`);
    return created;
  },

  async listRequests(scope: RequestScope, status?: string) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.productRequest.findMany({
      where: { branchId, ...(status ? { status } : {}) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.enrichRequests(rows);
  },

  /** Enriquecimiento común de órdenes (nombres de productos/usuarios, SOL vs ENV) para lista y ticket. */
  async enrichRequests(rows: (import('@prisma/client').ProductRequest & { items: import('@prisma/client').ProductRequestItem[] })[]) {
    const productIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.productId)))];
    const userIds = [...new Set(rows.flatMap((r) => [r.createdByUserId, r.requestedByUserId, r.dispatchedByUserId, r.receivedByUserId]).filter((x): x is string => !!x))];
    const [products, users] = await Promise.all([
      productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const pmap = new Map(products.map((p) => [p.id, p]));
    const umap = new Map(users.map((u) => [u.id, u.name]));
    const nm = (id?: string | null) => (id ? umap.get(id) ?? null : null);
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      notes: r.notes ?? null,
      // Trazabilidad del flujo (para el ticket de despacho).
      requestedBy: nm(r.requestedByUserId) ?? nm(r.createdByUserId),
      requestedAt: r.requestedAt ?? r.createdAt,
      dispatchedBy: nm(r.dispatchedByUserId),
      sentAt: r.sentAt,
      receivedBy: nm(r.receivedByUserId),
      receivedAt: r.receivedAt,
      rejectReason: r.rejectReason ?? null,
      rejectNote: r.rejectNote ?? null,
      items: r.items.map((i) => ({
        productId: i.productId,
        name: pmap.get(i.productId)?.name ?? '—',
        code: pmap.get(i.productId)?.sku ?? null,
        quantity: i.quantity, // enviado (en SENT/RECEIVED)
        requestedQty: i.requestedQty ?? i.quantity, // solicitado
      })),
    }));
  },

  /**
   * Envío por ítem (admin): envía las líneas seleccionadas con la cantidad que decide el
   * admin (puede ser distinta a la solicitada). Descuenta del almacén central, registra el
   * traslado a recepción (queda como envío SENT que recepción confirma) y quita las líneas
   * enviadas de las solicitudes; las solicitudes que quedan sin ítems se eliminan.
   */
  async sendItems(scope: RequestScope, dto: SendItemsDto) {
    const branchId = requireActiveBranch(scope);
    const reqIds = [...new Set(dto.lines.map((l) => l.requestId))];
    const reqs = await prisma.productRequest.findMany({ where: { id: { in: reqIds }, branchId, status: 'REQUESTED' }, include: { items: true } });
    const reqMap = new Map(reqs.map((r) => [r.id, r]));
    for (const l of dto.lines) {
      const r = reqMap.get(l.requestId);
      if (!r) throw new ValidationError('Alguna solicitud no existe o ya fue procesada');
      if (!r.items.some((i) => i.productId === l.productId)) throw new ValidationError('Un producto no pertenece a su solicitud');
    }
    // Total a enviar por producto (una línea por producto puede venir de varias solicitudes).
    const perProduct = new Map<string, number>();
    for (const l of dto.lines) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0) + l.quantity);
    const central = await productsRepository.defaultWarehouse(branchId);
    const receptionId = await receptionWarehouseId(branchId);
    const [stocks, prods] = await Promise.all([
      prisma.stock.findMany({ where: { warehouseId: central.id, productId: { in: [...perProduct.keys()] } } }),
      prisma.product.findMany({ where: { id: { in: [...perProduct.keys()] } }, select: { id: true, name: true } }),
    ]);
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));
    const nameMap = new Map(prods.map((p) => [p.id, p.name]));
    for (const [pid, qty] of perProduct) {
      if ((stockMap.get(pid) ?? 0) < qty) throw new ValidationError(`Stock insuficiente para "${nameMap.get(pid) ?? 'producto'}" (disponible ${stockMap.get(pid) ?? 0}, a enviar ${qty}).`);
    }
    // Cantidad SOLICITADA por producto (de las órdenes REQUESTED de origen) y datos del solicitante,
    // para conservar el SOL vs ENV y la trazabilidad en la orden SENT.
    const reqPerProduct = new Map<string, number>();
    for (const r of reqs) for (const it of r.items) if (perProduct.has(it.productId)) reqPerProduct.set(it.productId, (reqPerProduct.get(it.productId) ?? 0) + it.quantity);
    const origin = reqs.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.productRequest.create({
        data: {
          branchId, status: 'SENT', notes: 'Envío a recepción',
          createdByUserId: scope.userId,
          requestedByUserId: origin?.createdByUserId ?? null,
          requestedAt: origin?.createdAt ?? now,
          dispatchedByUserId: scope.userId,
          sentAt: now,
          items: { create: [...perProduct].map(([productId, quantity]) => ({ productId, quantity, requestedQty: reqPerProduct.get(productId) ?? quantity })) },
        },
      });
      for (const [pid, qty] of perProduct) {
        await applyStockTx(tx, pid, central.id, -qty);
        await createMovementTx(tx, { branchId, productId: pid, warehouseId: central.id, type: 'TRANSFER', quantity: -qty, reference: 'Enviado a recepción', relatedWarehouseId: receptionId, createdByUserId: scope.userId });
      }
      for (const l of dto.lines) await tx.productRequestItem.deleteMany({ where: { requestId: l.requestId, productId: l.productId } });
      for (const rid of reqIds) {
        if ((await tx.productRequestItem.count({ where: { requestId: rid } })) === 0) await tx.productRequest.delete({ where: { id: rid } });
      }
    });
    return { sent: dto.lines.length };
  },

  /** Elimina (rechaza) las líneas seleccionadas de las solicitudes pendientes. */
  async deleteItems(scope: RequestScope, dto: DeleteItemsDto) {
    const branchId = requireActiveBranch(scope);
    const reqIds = [...new Set(dto.lines.map((l) => l.requestId))];
    const valid = new Set((await prisma.productRequest.findMany({ where: { id: { in: reqIds }, branchId, status: 'REQUESTED' }, select: { id: true } })).map((r) => r.id));
    await prisma.$transaction(async (tx) => {
      for (const l of dto.lines) if (valid.has(l.requestId)) await tx.productRequestItem.deleteMany({ where: { requestId: l.requestId, productId: l.productId } });
      for (const rid of reqIds) {
        if (valid.has(rid) && (await tx.productRequestItem.count({ where: { requestId: rid } })) === 0) await tx.productRequest.delete({ where: { id: rid } });
      }
    });
    return { deleted: dto.lines.length };
  },

  /**
   * Admin envía lo solicitado (REQUESTED → SENT): descuenta del almacén central de
   * productos (valida stock) y registra la salida; la ropa queda "en tránsito" hasta
   * que recepción la confirme (receiveRequest la suma al almacén de recepción).
   */
  async sendRequest(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const req = await prisma.productRequest.findUnique({ where: { id }, include: { items: true } });
    if (!req || req.branchId !== branchId) throw new ValidationError('Solicitud no encontrada');
    if (req.status !== 'REQUESTED') throw new ValidationError('La solicitud ya fue procesada');

    const central = await productsRepository.defaultWarehouse(branchId);
    const receptionId = await receptionWarehouseId(branchId);
    const [stocks, prods] = await Promise.all([
      prisma.stock.findMany({ where: { warehouseId: central.id, productId: { in: req.items.map((i) => i.productId) } } }),
      prisma.product.findMany({ where: { id: { in: req.items.map((i) => i.productId) } }, select: { id: true, name: true } }),
    ]);
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));
    const nameMap = new Map(prods.map((p) => [p.id, p.name]));
    for (const it of req.items) {
      if ((stockMap.get(it.productId) ?? 0) < it.quantity) {
        throw new ValidationError(`Stock insuficiente en el almacén central para "${nameMap.get(it.productId) ?? 'producto'}" (disponible ${stockMap.get(it.productId) ?? 0}, solicitado ${it.quantity}).`);
      }
    }
    await prisma.$transaction(async (tx) => {
      for (const it of req.items) {
        await applyStockTx(tx, it.productId, central.id, -it.quantity);
        await createMovementTx(tx, {
          branchId, productId: it.productId, warehouseId: central.id, type: 'TRANSFER', quantity: -it.quantity,
          reference: `Enviado a recepción ${id.slice(0, 8)}`, relatedWarehouseId: receptionId, createdByUserId: scope.userId,
        });
      }
      await tx.productRequest.update({ where: { id }, data: { status: 'SENT' } });
    });
    return { sent: req.items.length };
  },

  /** Compat: recepción confirma (= ACEPTAR ORDEN completa). */
  async receiveRequest(scope: RequestScope, id: string) {
    return this.acceptRequest(scope, id);
  },

  /**
   * ACEPTAR ORDEN (SENT → RECEIVED): ingresa TODA la orden al stock de recepción, registra
   * quién/cuándo recepcionó, encola impresión y devuelve la orden enriquecida para el ticket.
   */
  async acceptRequest(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const req = await prisma.productRequest.findUnique({ where: { id }, include: { items: true } });
    if (!req || req.branchId !== branchId) throw new ValidationError('Solicitud no encontrada');
    if (req.status !== 'SENT') throw new ValidationError('La solicitud no está lista para recepcionar');

    const names = new Map(
      (await prisma.product.findMany({ where: { id: { in: req.items.map((i) => i.productId) } }, select: { id: true, name: true } }))
        .map((p) => [p.id, p.name] as const),
    );
    const printItems = req.items.map((it) => ({ productId: it.productId, name: names.get(it.productId) ?? it.productId, quantity: it.quantity }));
    const now = new Date();

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
      await tx.productRequest.update({ where: { id }, data: { status: 'RECEIVED', receivedByUserId: scope.userId, receivedAt: now } });
      await tx.printJob.create({
        data: { branchId, type: 'RECEPCION', title: `Recepción de productos (${req.items.length} ítems)`, payload: JSON.stringify(printItems), status: 'PENDING' },
      });
    });
    const [order] = await this.enrichRequests([{ ...req, status: 'RECEIVED', receivedByUserId: scope.userId, receivedAt: now }]);
    return { received: req.items.length, order };
  },

  /**
   * RECHAZAR ORDEN (SENT → REJECTED): NO ingresa al inventario de recepción. Para no perder el
   * stock (ya salió del central al despachar), lo DEVUELVE al almacén central. Guarda motivo,
   * observación y quién/cuándo rechazó.
   */
  async rejectRequest(scope: RequestScope, id: string, dto: RejectDto) {
    const branchId = requireActiveBranch(scope);
    const req = await prisma.productRequest.findUnique({ where: { id }, include: { items: true } });
    if (!req || req.branchId !== branchId) throw new ValidationError('Solicitud no encontrada');
    if (req.status !== 'SENT') throw new ValidationError('La solicitud no está lista para rechazar');
    const central = await productsRepository.defaultWarehouse(branchId);
    const receptionId = await receptionWarehouseId(branchId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Devuelve al central lo despachado (revierte el TRANSFER de salida).
      for (const it of req.items) {
        await applyStockTx(tx, it.productId, central.id, it.quantity);
        await createMovementTx(tx, { branchId, productId: it.productId, warehouseId: central.id, type: 'TRANSFER', quantity: it.quantity, reference: `Rechazo recepción ${id.slice(0, 8)} — devuelto`, relatedWarehouseId: receptionId, createdByUserId: scope.userId });
      }
      await tx.productRequest.update({ where: { id }, data: { status: 'REJECTED', receivedByUserId: scope.userId, receivedAt: now, rejectReason: dto.reason, rejectNote: dto.note?.trim() || null } });
    });
    const [order] = await this.enrichRequests([{ ...req, status: 'REJECTED', receivedByUserId: scope.userId, receivedAt: now, rejectReason: dto.reason, rejectNote: dto.note?.trim() || null }]);
    return { rejected: req.items.length, order };
  },

  /** Dar de baja stock de recepción (requiere permiso de eliminar). */
  async writeOff(scope: RequestScope, dto: WriteOffDto) {
    await requireReceptionFlag(scope, 'productWriteoff', 'La baja de productos requiere autorización de administración. Genera una solicitud de baja para que administración la ejecute.');
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const stock = await prisma.stock.findUnique({ where: { productId_warehouseId: { productId: dto.productId, warehouseId: whId } } });
    if (!stock || stock.quantity < dto.quantity) throw new ValidationError('Stock insuficiente para dar de baja');
    const motivo = dto.motivo;
    const reason = `${motivo}${dto.notes ? `: ${dto.notes}` : ''}`;

    if (motivo === 'SOBRANTE') {
      // El sobrante NO se pierde: regresa al almacén de productos general.
      const productsWh = await productsRepository.defaultWarehouse(branchId);
      await prisma.$transaction(async (tx) => {
        await tx.stock.update({ where: { productId_warehouseId: { productId: dto.productId, warehouseId: whId } }, data: { quantity: { decrement: dto.quantity } } });
        await tx.stock.upsert({
          where: { productId_warehouseId: { productId: dto.productId, warehouseId: productsWh.id } },
          update: { quantity: { increment: dto.quantity } },
          create: { productId: dto.productId, warehouseId: productsWh.id, quantity: dto.quantity },
        });
        await createMovementTx(tx, { branchId, productId: dto.productId, warehouseId: whId, type: 'TRANSFER', quantity: -dto.quantity, unitCost: null, reference: 'Sobrante → Almacén de Productos', relatedWarehouseId: productsWh.id, createdByUserId: scope.userId });
        await createMovementTx(tx, { branchId, productId: dto.productId, warehouseId: productsWh.id, type: 'TRANSFER', quantity: dto.quantity, unitCost: null, reference: 'Devolución sobrante desde Recepción', relatedWarehouseId: whId, createdByUserId: scope.userId });
      });
      return { ok: true, motivo, returned: dto.quantity };
    }

    // VENCIDO / PERDIDO: sale del inventario de recepción y queda el rastro (StockWriteOff + Kardex).
    await prisma.$transaction(async (tx) => {
      await tx.stock.update({ where: { productId_warehouseId: { productId: dto.productId, warehouseId: whId } }, data: { quantity: { decrement: dto.quantity } } });
      await tx.inventoryMovement.create({ data: { branchId, productId: dto.productId, warehouseId: whId, type: 'OUT', quantity: -dto.quantity, reference: `Baja (${reason})`, createdByUserId: scope.userId } });
      await tx.stockWriteOff.create({ data: { branchId, productId: dto.productId, quantity: dto.quantity, reason, createdByUserId: scope.userId } });
    });
    return { ok: true, motivo };
  },

  async printQueue(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    return prisma.printJob.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' }, take: 50 });
  },

  /** Marca un trabajo de impresión como impreso (tras enviarlo a QZ/navegador). */
  async markPrinted(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const job = await prisma.printJob.findUnique({ where: { id } });
    if (!job || job.branchId !== branchId) throw new ValidationError('Trabajo de impresión no encontrado');
    return prisma.printJob.update({ where: { id }, data: { status: 'PRINTED' } });
  },
};
