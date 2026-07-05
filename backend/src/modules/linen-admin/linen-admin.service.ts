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
async function supplyToFloor(branchId: string, linenItemId: string, floor: string, quantity: number, userId: string, type: string, reference: string) {
  if (floor === LINEN_CENTRAL) throw new ValidationError('El destino no puede ser el almacén central');
  await prisma.$transaction(async (tx) => {
    const central = await tx.linenStock.findUnique({ where: { linenItemId_floor: { linenItemId, floor: LINEN_CENTRAL } } });
    if (!central || central.rem < quantity) {
      throw new ValidationError(`Stock insuficiente en el almacén central de ropa (disponible ${central?.rem ?? 0}, solicitado ${quantity}).`);
    }
    await tx.linenStock.update({ where: { linenItemId_floor: { linenItemId, floor: LINEN_CENTRAL } }, data: { rem: { decrement: quantity } } });
    await tx.linenStock.upsert({
      where: { linenItemId_floor: { linenItemId, floor } },
      update: { rem: { increment: quantity }, sum: { increment: quantity } },
      create: { branchId, linenItemId, floor, rem: quantity, sum: quantity },
    });
    await tx.linenMovement.create({
      data: { branchId, linenItemId, type: 'OUT', quantity: -quantity, floor: LINEN_CENTRAL, areaFrom: 'Almacén de Ropa', areaTo: floor, reference, createdByUserId: userId },
    });
    await tx.linenMovement.create({
      data: { branchId, linenItemId, type, quantity, floor, areaFrom: 'Almacén de Ropa', areaTo: floor, reference, createdByUserId: userId },
    });
  });
}

/** Repone el almacén central de ropa (compra/ingreso del administrador). */
export const replenishSchema = z.object({
  linenItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
});
export type ReplenishDto = z.infer<typeof replenishSchema>;

export const createItemSchema = z.object({
  type: z.enum(['TOALLA', 'SABANA', 'EDREDON', 'AMENITY']),
  name: z.string().min(1).max(120),
  color: z.string().max(60).optional().or(z.literal('')),
  reusable: z.coerce.boolean().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
});
export const updateItemSchema = z.object({
  type: z.enum(['TOALLA', 'SABANA', 'EDREDON', 'AMENITY']).optional(),
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(60).optional().or(z.literal('')),
  reusable: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

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
    const st = new Map<string, { base: number; central: number }>();
    for (const s of stocks) {
      const e = st.get(s.linenItemId) ?? { base: 0, central: 0 };
      e.base += s.sum;
      if (s.floor === LINEN_CENTRAL) e.central += s.rem;
      st.set(s.linenItemId, e);
    }
    const lav = new Map<string, { sent: number; back: number }>();
    for (const m of movs) {
      const q = Math.abs(m._sum.quantity ?? 0);
      const e = lav.get(m.linenItemId) ?? { sent: 0, back: 0 };
      if (m.type === 'LAUNDRY') e.sent += q; else e.back += q;
      lav.set(m.linenItemId, e);
    }
    const PREFIX: Record<string, string> = { TOALLA: 'TOA', SABANA: 'SAB', EDREDON: 'EDR', AMENITY: 'AME' };
    const seq: Record<string, number> = {};
    return items.map((it) => {
      const s = st.get(it.id) ?? { base: 0, central: 0 };
      const base = s.base;
      const disponible = s.central;
      const transferido = Math.max(0, base - disponible);
      const l = lav.get(it.id) ?? { sent: 0, back: 0 };
      const lavanderia = Math.max(0, Math.min(transferido, l.sent - l.back));
      const enUso = Math.max(0, transferido - lavanderia);
      const n = (seq[it.type] = (seq[it.type] ?? 0) + 1);
      return {
        linenItemId: it.id,
        code: `${PREFIX[it.type] ?? 'ART'}-${String(n).padStart(3, '0')}`,
        name: it.name,
        type: it.type,
        color: it.color,
        base,
        disponible,
        transferido,
        enUso,
        lavanderia,
        enProceso: 0,
        recibidas: null as number | null,
        perdidos: 0,
        belowStock: disponible <= 0,
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
  async createItem(scope: RequestScope, dto: { type: string; name: string; color?: string; reusable?: boolean; quantity?: number }) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.create({
      data: { branchId, type: dto.type, name: dto.name.trim(), color: dto.color || null, reusable: dto.reusable ?? true, status: 'active' },
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

  /** Edita un artículo de ropa (nombre/tipo/color/estado). */
  async updateItem(scope: RequestScope, id: string, dto: { type?: string; name?: string; color?: string; reusable?: boolean; status?: string }) {
    const branchId = requireActiveBranch(scope);
    const item = await prisma.linenItem.findUnique({ where: { id } });
    if (!item || item.branchId !== branchId) throw new ValidationError('Ropa no encontrada');
    return prisma.linenItem.update({
      where: { id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color || null } : {}),
        ...(dto.reusable !== undefined ? { reusable: dto.reusable } : {}),
        ...(dto.status ? { status: dto.status } : {}),
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
