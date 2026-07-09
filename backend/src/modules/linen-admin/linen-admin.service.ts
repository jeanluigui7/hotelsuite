import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/** Lado administrador del inventario de ropa: transferir ropa a un piso (suministrar) y
 *  atender las solicitudes de ropa que envía limpieza (LinenMovement type REQUEST). */

export const transferSchema = z.object({
  linenItemId: z.string().min(1),
  toFloor: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
});
export type TransferDto = z.infer<typeof transferSchema>;

/** Almacén central de ropa (origen de los suministros del administrador). */
export const LINEN_CENTRAL = 'ALMACEN';

/**
 * Suministra ropa del almacén central a un piso: valida y descuenta el remanente del
 * almacén central, e incrementa el remanente (rem) y el acumulado suministrado (sum)
 * del piso destino. Registra los dos movimientos (salida del central + entrada al piso).
 */
type LinenTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Núcleo del suministro (dentro de una transacción dada). Permite agrupar varias
 *  filas de una transferencia masiva en una sola transacción atómica. */
async function supplyToFloorTx(tx: LinenTx, branchId: string, linenItemId: string, floor: string, quantity: number, userId: string, type: string, reference: string) {
  if (floor === LINEN_CENTRAL) throw new ValidationError('El destino no puede ser el almacén central');
  const central = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId, floor: LINEN_CENTRAL } } });
  if (!central || central.rem < quantity) {
    throw new ValidationError(`Stock insuficiente en el almacén central de ropa (disponible ${central?.rem ?? 0}, solicitado ${quantity}).`);
  }
  await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId, floor: LINEN_CENTRAL } }, data: { rem: { decrement: quantity } } });
  // Suministrar durante el turno actual: SOLO incrementa SUM del piso. REM (remanente
  // del turno anterior) NO se toca aquí; solo cambia al cierre de turno (closeShift).
  // El total disponible del piso es REM + SUM.
  await tx.linenStock.upsert({
    where: { linenItemId_floor: { linenItemId, floor } },
    update: { sum: { increment: quantity } },
    create: { branchId, linenItemId, floor, rem: 0, sum: quantity },
  });
  await tx.linenMovement.create({
    data: { branchId, linenItemId, type: 'OUT', quantity: -quantity, floor: LINEN_CENTRAL, areaFrom: 'Almacén de Ropa', areaTo: floor, reference, createdByUserId: userId },
  });
  await tx.linenMovement.create({
    data: { branchId, linenItemId, type, quantity, floor, areaFrom: 'Almacén de Ropa', areaTo: floor, reference, createdByUserId: userId },
  });
}

/**
 * Consume ropa del disponible de un piso (REM + SUM). Descuenta primero de SUM (lo
 * suministrado en el turno actual) y solo si no alcanza, del REM (remanente). Usado por
 * lavandería (manchada) y por la entrega de suministros a habitación.
 * Devuelve el detalle descontado. Lanza si el disponible es insuficiente.
 */
export async function consumeFloorTx(tx: LinenTx, linenItemId: string, floor: string, quantity: number) {
  const stock = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId, floor } } });
  const avail = (stock?.rem ?? 0) + (stock?.sum ?? 0);
  if (!stock || avail < quantity) throw new ValidationError(`Cantidad insuficiente en el piso (disponible ${avail}, solicitado ${quantity}).`);
  const fromSum = Math.min(stock.sum, quantity);
  const fromRem = quantity - fromSum;
  await tx.linenStock.update({
    where: { linenItemId_floor: { linenItemId, floor } },
    data: { sum: { decrement: fromSum }, rem: { decrement: fromRem } },
  });
  return { fromSum, fromRem };
}

async function supplyToFloor(branchId: string, linenItemId: string, floor: string, quantity: number, userId: string, type: string, reference: string) {
  await prisma.$transaction((tx) => supplyToFloorTx(tx, branchId, linenItemId, floor, quantity, userId, type, reference));
}

/** Transferencia masiva: varias filas (ítem × piso × cantidad) en una sola operación atómica. */
export const transferBulkSchema = z.object({
  rows: z.array(z.object({
    linenItemId: z.string().min(1),
    toFloor: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
  })).min(1).max(500),
});
export type TransferBulkDto = z.infer<typeof transferBulkSchema>;

/** Repone el almacén central de ropa (compra/ingreso del administrador). */
export const replenishSchema = z.object({
  linenItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
});
export type ReplenishDto = z.infer<typeof replenishSchema>;

const itemFields = {
  // El tipo ya no se pide en el formulario: se autocompleta con el nombre de la Categoría.
  type: z.string().max(120).optional().or(z.literal('')),
  name: z.string().min(1).max(120),
  color: z.string().max(60).optional().or(z.literal('')),
  size: z.string().max(60).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  reusable: z.coerce.boolean().optional(),
  code: z.string().max(60).optional().or(z.literal('')),
  barcode: z.string().max(120).optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
  brand: z.string().max(120).optional().or(z.literal('')),
  categoryId: z.string().min(1).optional().nullable(),
  unit: z.string().max(20).optional(),
  igvType: z.string().max(20).optional(),
  igvPercent: z.coerce.number().min(0).max(100).optional(),
  taxable: z.coerce.boolean().optional(),
  salePrice: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0).optional(),
  reorderPoint: z.coerce.number().int().min(0).optional(),
  receptionReorderPoint: z.coerce.number().int().min(0).optional(),
};
// Al crear ropa, Categoría y Tamaño son obligatorios (el tipo de prenda lo define la categoría).
export const createItemSchema = z.object({ ...itemFields, categoryId: z.string().min(1), size: z.string().min(1).max(60), quantity: z.coerce.number().int().min(0).optional() });
export const updateItemSchema = z.object({ ...itemFields, name: itemFields.name.optional(), status: z.enum(['active', 'inactive']).optional() });

export const linenAdminService = {
  /** Solicitudes de ropa pendientes (enviadas por limpieza). */
  async requests(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const movs = await prisma.linenMovement.findMany({ where: { branchId, type: 'REQUEST' }, orderBy: { createdAt: 'desc' } });
    const ids = [...new Set(movs.map((m) => m.linenItemId))];
    const items = await prisma.linenItem.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, name: true } });
    const imap = new Map(items.map((i) => [i.id, i]));
    return movs.map((m) => ({
      id: m.id,
      linenItemId: m.linenItemId,
      type: imap.get(m.linenItemId)?.type ?? '',
      name: imap.get(m.linenItemId)?.name ?? '—',
      floor: m.floor,
      quantity: m.quantity,
      createdAt: m.createdAt,
    }));
  },

  /** Atiende (envía) una solicitud: suministra al piso y elimina la solicitud pendiente. */
  async fulfill(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const mov = await prisma.linenMovement.findUnique({ where: { id } });
    if (!mov || mov.branchId !== branchId || mov.type !== 'REQUEST') throw new ValidationError('Solicitud no encontrada');
    await supplyToFloor(branchId, mov.linenItemId, mov.floor ?? 'SIN PISO', mov.quantity, scope.userId, 'SUPPLY', 'Atención de solicitud');
    await prisma.linenMovement.delete({ where: { id } });
    return { ok: true };
  },

  /** Rechaza una solicitud de ropa pendiente (cleaning, por falta de tiempo/stock). Solo la cancela. */
  async reject(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const mov = await prisma.linenMovement.findUnique({ where: { id } });
    if (!mov || mov.branchId !== branchId || mov.type !== 'REQUEST') throw new ValidationError('Solicitud no encontrada');
    await prisma.linenMovement.delete({ where: { id } });
    return { ok: true };
  },

  /** Transfiere ropa a un piso (suministrado). */
  async transfer(scope: RequestScope, dto: TransferDto) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id: dto.linenItemId } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    await supplyToFloor(branchId, dto.linenItemId, dto.toFloor, dto.quantity, scope.userId, 'TRANSFER', 'Transferencia de ropa');
    return { ok: true };
  },

  /**
   * Transferencia masiva: envía distintos ítems y cantidades a distintos pisos en una
   * sola operación atómica. Filas con cantidad 0 deben venir filtradas desde el cliente.
   */
  async transferBulk(scope: RequestScope, dto: TransferBulkDto) {
    const branchId = requireActiveBranch(scope);
    const itemIds = [...new Set(dto.rows.map((r) => r.linenItemId))];
    const items = await prisma.linenItem.findMany({ where: { id: { in: itemIds }, branchId }, select: { id: true } });
    if (items.length !== itemIds.length) throw new ValidationError('Ropa no encontrada');
    let sent = 0;
    await prisma.$transaction(async (tx) => {
      for (const r of dto.rows) {
        await supplyToFloorTx(tx, branchId, r.linenItemId, r.toFloor, r.quantity, scope.userId, 'TRANSFER', 'Transferencia de ropa');
        sent += r.quantity;
      }
    });
    return { ok: true, rows: dto.rows.length, sent };
  },

  /**
   * Cierre/cambio de turno de ropa: consolida en cada piso el suministrado del turno
   * dentro del remanente (NUEVO REM = REM + SUM, NUEVO SUM = 0). El total disponible por
   * piso no cambia; solo pasa a contarse como remanente del siguiente turno.
   */
  async closeShift(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.linenStock.findMany({ where: { branchId, floor: { not: LINEN_CENTRAL }, sum: { gt: 0 } } });
    if (!rows.length) return { ok: true, floors: 0, moved: 0 };
    await prisma.$transaction(
      rows.map((s) =>
        prisma.linenStock.update({ where: { id: s.id }, data: { rem: s.rem + s.sum, sum: 0 } }),
      ),
    );
    const floors = new Set(rows.map((r) => r.floor)).size;
    const moved = rows.reduce((a, r) => a + r.sum, 0);
    return { ok: true, floors, moved };
  },

  /**
   * Almacén general de ropa: por ítem, stock base (dotación), disponible (central),
   * transferido, en uso y en lavandería (todo con data real de stock/movimientos).
   * En proceso / recibidas / perdidos quedan para la fase de ciclo (Fase 2).
   */
  async warehouse(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const ids = items.map((i) => i.id);
    const [stocks, movs] = await Promise.all([
      prisma.linenStock.findMany({ where: { branchId, linenItemId: { in: ids } } }),
      prisma.linenMovement.groupBy({ by: ['linenItemId', 'type'], where: { branchId, type: { in: ['LAUNDRY', 'PICKUP'] } }, _sum: { quantity: true } }),
    ]);
    // Físico real: central = REM del almacén; pisos = REM + SUM (remanente + suministrado
    // en el turno). Antes se usaba solo SUM, lo que duplicaba lo transferido.
    const st = new Map<string, { central: number; atFloors: number }>();
    for (const s of stocks) {
      const e = st.get(s.linenItemId) ?? { central: 0, atFloors: 0 };
      if (s.floor === LINEN_CENTRAL) e.central += s.rem;
      else e.atFloors += s.rem + s.sum;
      st.set(s.linenItemId, e);
    }
    const lav = new Map<string, { sent: number; back: number }>();
    for (const m of movs) {
      const q = Math.abs(m._sum.quantity ?? 0);
      const e = lav.get(m.linenItemId) ?? { sent: 0, back: 0 };
      if (m.type === 'LAUNDRY') e.sent += q; else e.back += q;
      lav.set(m.linenItemId, e);
    }
    const cats = await prisma.inventoryCategory.findMany({ where: { branchId }, select: { id: true, name: true } });
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const PREFIX: Record<string, string> = { TOALLA: 'TOA', SABANA: 'SAB', EDREDON: 'EDR', AMENITY: 'AME' };
    const seq: Record<string, number> = {};
    return items.map((it) => {
      const s = st.get(it.id) ?? { central: 0, atFloors: 0 };
      const disponible = s.central;
      const l = lav.get(it.id) ?? { sent: 0, back: 0 };
      const inLaundry = Math.max(0, l.sent - l.back);
      // Transferido = lo que está fuera del central (en pisos + en lavandería).
      const transferido = s.atFloors + inLaundry;
      const lavanderia = inLaundry;
      const enUso = s.atFloors;
      const base = disponible + transferido;
      const n = (seq[it.type] = (seq[it.type] ?? 0) + 1);
      return {
        linenItemId: it.id,
        code: it.code || `${PREFIX[it.type] ?? 'ART'}-${String(n).padStart(3, '0')}`,
        name: it.name,
        type: it.type,
        color: it.color,
        size: it.size,
        notes: it.notes,
        base,
        disponible,
        transferido,
        enUso,
        lavanderia,
        enProceso: 0,
        recibidas: null as number | null,
        perdidos: 0,
        min: it.reorderPoint,
        belowStock: disponible <= it.reorderPoint,
        // Campos para el modal de edición (tipo producto).
        barcode: it.barcode,
        imageUrl: it.imageUrl,
        brand: it.brand,
        reusable: it.reusable,
        categoryId: it.categoryId,
        categoryName: it.categoryId ? catName.get(it.categoryId) ?? null : null,
        unit: it.unit,
        igvType: it.igvType,
        igvPercent: Number(it.igvPercent),
        taxable: it.taxable,
        salePrice: Number(it.salePrice),
        cost: Number(it.cost),
        reorderPoint: it.reorderPoint,
        receptionReorderPoint: it.receptionReorderPoint,
        status: it.status,
      };
    });
  },

  /** Stock disponible en el almacén central de ropa (por ítem). */
  async central(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [items, stocks] = await Promise.all([
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.linenStock.findMany({ where: { branchId, floor: LINEN_CENTRAL } }),
    ]);
    const smap = new Map(stocks.map((s) => [s.linenItemId, s.rem]));
    return items.map((it) => ({ linenItemId: it.id, type: it.type, name: it.name, rem: smap.get(it.id) ?? 0 }));
  },

  /** Crea un artículo de ropa (opcionalmente con stock inicial en el central). */
  async createItem(scope: RequestScope, dto: z.infer<typeof createItemSchema>) {
    const branchId = requireActiveBranch(scope);
    // La categoría (tipo Ropa) define el tipo de prenda → autocompleta LinenItem.type.
    const category = await prisma.inventoryCategory.findUnique({ where: { id: dto.categoryId }, select: { name: true, type: true, branchId: true } });
    if (!category || category.branchId !== branchId) throw new ValidationError('Categoría no encontrada');
    if (category.type !== 'CLOTHING') throw new ValidationError('La categoría debe ser de tipo Ropa');
    const item = await prisma.linenItem.create({
      data: {
        branchId,
        type: dto.type?.trim() || category.name,
        name: dto.name.trim(),
        color: dto.color || null,
        size: dto.size?.trim() || null,
        notes: dto.notes?.trim() || null,
        reusable: true, // toda prenda de ropa es reutilizable por definición
        status: 'active',
        code: dto.code || null,
        barcode: dto.barcode || null,
        imageUrl: dto.imageUrl || null,
        brand: dto.brand || null,
        categoryId: dto.categoryId,
        unit: dto.unit ?? 'NIU',
        igvType: dto.igvType ?? 'GRAVADO',
        igvPercent: dto.igvPercent ?? 18,
        taxable: dto.taxable ?? true,
        salePrice: dto.salePrice ?? 0,
        cost: dto.cost ?? 0,
        reorderPoint: dto.reorderPoint ?? 0,
        receptionReorderPoint: dto.receptionReorderPoint ?? 0,
      },
    });
    if (dto.quantity && dto.quantity > 0) {
      await prisma.linenStock.upsert({
        where: { linenItemId_floor: { linenItemId: item.id, floor: LINEN_CENTRAL } },
        update: { rem: { increment: dto.quantity }, sum: { increment: dto.quantity } },
        create: { branchId, linenItemId: item.id, floor: LINEN_CENTRAL, rem: dto.quantity, sum: dto.quantity },
      });
    }
    return item;
  },

  /** Edita un artículo de ropa (todos los campos tipo producto). */
  async updateItem(scope: RequestScope, id: string, dto: z.infer<typeof updateItemSchema>) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    // Si cambia la categoría, se re-deriva el tipo de prenda (LinenItem.type = nombre de la categoría).
    let derivedType: string | undefined;
    if (dto.categoryId) {
      const category = await prisma.inventoryCategory.findUnique({ where: { id: dto.categoryId }, select: { name: true, type: true, branchId: true } });
      if (!category || category.branchId !== branchId) throw new ValidationError('Categoría no encontrada');
      if (category.type !== 'CLOTHING') throw new ValidationError('La categoría debe ser de tipo Ropa');
      derivedType = category.name;
    }
    return prisma.linenItem.update({
      where: { id },
      data: {
        ...(derivedType ? { type: derivedType } : dto.type ? { type: dto.type } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color || null } : {}),
        ...(dto.size !== undefined ? { size: dto.size || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        reusable: true, // la ropa siempre es reutilizable
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.code !== undefined ? { code: dto.code || null } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode || null } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
        ...(dto.brand !== undefined ? { brand: dto.brand || null } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId ?? null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.igvType !== undefined ? { igvType: dto.igvType } : {}),
        ...(dto.igvPercent !== undefined ? { igvPercent: dto.igvPercent } : {}),
        ...(dto.taxable !== undefined ? { taxable: dto.taxable } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
        ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
        ...(dto.reorderPoint !== undefined ? { reorderPoint: dto.reorderPoint } : {}),
        ...(dto.receptionReorderPoint !== undefined ? { receptionReorderPoint: dto.receptionReorderPoint } : {}),
      },
    });
  },

  /** Desactiva (soft-delete) un artículo de ropa. */
  async deactivateItem(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    await prisma.linenItem.update({ where: { id }, data: { status: 'inactive' } });
    return { success: true };
  },

  /** Repone el almacén central de ropa (ingreso/compra del administrador). */
  async replenish(scope: RequestScope, dto: ReplenishDto) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id: dto.linenItemId } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    await prisma.$transaction(async (tx) => {
      await tx.linenStock.upsert({
        where: { linenItemId_floor: { linenItemId: dto.linenItemId, floor: LINEN_CENTRAL } },
        update: { rem: { increment: dto.quantity }, sum: { increment: dto.quantity } },
        create: { branchId, linenItemId: dto.linenItemId, floor: LINEN_CENTRAL, rem: dto.quantity, sum: dto.quantity },
      });
      await tx.linenMovement.create({
        data: { branchId, linenItemId: dto.linenItemId, type: 'IN', quantity: dto.quantity, floor: LINEN_CENTRAL, areaTo: 'Almacén de Ropa', reference: 'Ingreso/compra de ropa', createdByUserId: scope.userId },
      });
    });
    return { ok: true };
  },
};
