import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
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
export type RequestDto = z.infer<typeof requestSchema>;
export type WriteOffDto = z.infer<typeof writeOffSchema>;

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

    const [products, stocks, movs] = await Promise.all([
      prisma.product.findMany({ where: { branchId, status: 'active' }, include: { category: { select: { name: true } } }, orderBy: { sku: 'asc' } }),
      prisma.stock.findMany({ where: { warehouseId: whId } }),
      // Solo se necesitan los movimientos desde el inicio del turno en adelante.
      prisma.inventoryMovement.findMany({
        where: { branchId, warehouseId: whId, createdAt: { gte: win.from } },
        select: { productId: true, quantity: true, createdAt: true },
      }),
    ]);
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

    // Sumas por producto: desde el inicio del turno, desde el fin, y dentro del turno.
    const sinceFrom = new Map<string, number>();
    const sinceTo = new Map<string, number>();
    const ingresos = new Map<string, number>();
    const salidas = new Map<string, number>();
    for (const m of movs) {
      if (!m.productId) continue;
      sinceFrom.set(m.productId, (sinceFrom.get(m.productId) ?? 0) + m.quantity);
      if (m.createdAt >= win.to) {
        sinceTo.set(m.productId, (sinceTo.get(m.productId) ?? 0) + m.quantity);
      } else {
        // dentro del turno [from, to)
        if (m.quantity > 0) ingresos.set(m.productId, (ingresos.get(m.productId) ?? 0) + m.quantity);
        else salidas.set(m.productId, (salidas.get(m.productId) ?? 0) + Math.abs(m.quantity));
      }
    }

    return {
      warehouseId: whId,
      turn: {
        shift: win.shift,
        businessDate: win.businessDate,
        startTime: win.startTime,
        endTime: win.endTime,
        isCurrent: win.isCurrent,
      },
      items: products.map((p) => {
        const current = stockMap.get(p.id) ?? 0;
        const stockFinal = current - (sinceTo.get(p.id) ?? 0);
        const stockInicial = current - (sinceFrom.get(p.id) ?? 0);
        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          categoryId: p.categoryId,
          categoryName: p.category?.name ?? null,
          stockInicial,
          ingresos: ingresos.get(p.id) ?? 0,
          salidas: salidas.get(p.id) ?? 0,
          stock: stockFinal,
          min: p.receptionReorderPoint,
          belowMin: stockFinal <= p.receptionReorderPoint,
        };
      }),
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

  /** Recepción confirma recepción (SENT → RECEIVED): suma stock + movimiento + cola de impresión. */
  async receiveRequest(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const whId = await receptionWarehouseId(branchId);
    const req = await prisma.productRequest.findUnique({ where: { id }, include: { items: true } });
    if (!req || req.branchId !== branchId) throw new ValidationError('Solicitud no encontrada');
    if (req.status !== 'SENT') throw new ValidationError('La solicitud no está lista para recepcionar');

    // Nombres para el comprobante de impresión (el payload debe ser legible, no GUIDs).
    const names = new Map(
      (await prisma.product.findMany({ where: { id: { in: req.items.map((i) => i.productId) } }, select: { id: true, name: true } }))
        .map((p) => [p.id, p.name] as const),
    );
    const printItems = req.items.map((it) => ({ productId: it.productId, name: names.get(it.productId) ?? it.productId, quantity: it.quantity }));

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
        data: { branchId, type: 'RECEPCION', title: `Recepción de productos (${req.items.length} ítems)`, payload: JSON.stringify(printItems), status: 'PENDING' },
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
