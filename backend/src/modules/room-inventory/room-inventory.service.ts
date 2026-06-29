import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import type { SaveInitialDto, LoadBaseDto } from './room-inventory.schema';

async function getRoom(scope: RequestScope, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { roomType: { select: { id: true, name: true } } } });
  if (!room || room.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Habitación no encontrada');
  return room;
}

export const roomInventoryService = {
  /** Kardex consolidado del inventario por habitación / ubicación, con filtros. */
  async kardex(scope: RequestScope, filters: { name?: string; roomId?: string; type?: string; from?: string; to?: string }) {
    const branchId = requireActiveBranch(scope);
    const where: Record<string, unknown> = { branchId };
    if (filters.name) where.name = { contains: filters.name };
    if (filters.roomId) where.roomId = filters.roomId;
    if (filters.type) where.type = filters.type;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
      };
    }
    const rows = await prisma.roomInventoryMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    const roomIds = [...new Set(rows.map((r) => r.roomId).filter((x): x is string => !!x))];
    const rooms = roomIds.length ? await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }) : [];
    const rmap = new Map(rooms.map((r) => [r.id, r.number]));
    return rows.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      type: m.type,
      articleKind: m.articleKind,
      name: m.name,
      quantity: m.quantity,
      room: m.roomId ? (rmap.get(m.roomId) ?? null) : null,
      fromLocation: m.fromLocation,
      toLocation: m.toLocation,
      reference: m.reference,
      note: m.note,
    }));
  },

  /** Devuelve el inventario de la habitación: dotación esperada (por tipo) vs stock actual. */
  async get(scope: RequestScope, roomId: string) {
    const room = await getRoom(scope, roomId);
    const [dot, inv] = await Promise.all([
      prisma.roomTypeDotacion.findMany({
        where: { branchId: room.branchId, roomTypeId: room.roomTypeId, status: 'active' },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.roomInventory.findMany({ where: { roomId } }),
    ]);
    const invMap = new Map(inv.map((i) => [`${i.articleKind}|${i.name}`, i.quantity]));
    const dotKeys = new Set(dot.map((d) => `${d.articleKind}|${d.name}`));
    const rows = dot.map((d) => ({
      name: d.name,
      articleKind: d.articleKind,
      category: d.category,
      baseQty: d.baseQty,
      required: d.required,
      allowExtra: d.allowExtra,
      quantity: invMap.get(`${d.articleKind}|${d.name}`) ?? 0,
      source: 'dotacion' as const,
    }));
    // Artículos presentes en la habitación que no están en la dotación (extras).
    for (const i of inv) {
      if (!dotKeys.has(`${i.articleKind}|${i.name}`)) {
        rows.push({ name: i.name, articleKind: i.articleKind, category: null, baseQty: 0, required: false, allowExtra: true, quantity: i.quantity, source: 'extra' as never });
      }
    }
    return { room: { id: room.id, number: room.number, floor: room.floor, roomType: room.roomType }, rows };
  },

  /**
   * Inventario inicial (conteo físico): fija las cantidades reales de la habitación.
   * NO descuenta de ningún almacén (arranque del sistema). Registra movimiento INITIAL.
   */
  async saveInitial(scope: RequestScope, roomId: string, dto: SaveInitialDto) {
    const room = await getRoom(scope, roomId);
    const branchId = room.branchId;
    await prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        const key = { roomId_articleKind_name: { roomId, articleKind: it.articleKind, name: it.name } };
        const existing = await tx.roomInventory.findUnique({ where: key });
        const delta = it.quantity - (existing?.quantity ?? 0);
        await tx.roomInventory.upsert({
          where: key,
          update: { quantity: it.quantity },
          create: { branchId, roomId, articleKind: it.articleKind, name: it.name, quantity: it.quantity },
        });
        if (delta !== 0) {
          await tx.roomInventoryMovement.create({
            data: { branchId, roomId, type: 'INITIAL', articleKind: it.articleKind, name: it.name, quantity: delta, toLocation: `Habitación ${room.number}`, reference: 'Inventario inicial', note: dto.note || null, createdByUserId: scope.userId },
          });
        }
      }
    });
    return { ok: true };
  },

  /**
   * Carga inicial: deja la habitación con la dotación BASE de su tipo. Registra ROOM_LOAD.
   * En el arranque no descuenta del almacén (la reposición con descuento llega en la fase de limpieza).
   */
  async loadBase(scope: RequestScope, roomId: string, _dto: LoadBaseDto) {
    const room = await getRoom(scope, roomId);
    const branchId = room.branchId;
    const dot = await prisma.roomTypeDotacion.findMany({ where: { branchId, roomTypeId: room.roomTypeId, status: 'active' } });
    await prisma.$transaction(async (tx) => {
      for (const d of dot) {
        const key = { roomId_articleKind_name: { roomId, articleKind: d.articleKind, name: d.name } };
        const existing = await tx.roomInventory.findUnique({ where: key });
        const delta = d.baseQty - (existing?.quantity ?? 0);
        await tx.roomInventory.upsert({
          where: key,
          update: { quantity: d.baseQty },
          create: { branchId, roomId, articleKind: d.articleKind, name: d.name, quantity: d.baseQty },
        });
        if (delta !== 0) {
          await tx.roomInventoryMovement.create({
            data: { branchId, roomId, type: 'ROOM_LOAD', articleKind: d.articleKind, name: d.name, quantity: delta, fromLocation: 'Almacén de Limpieza', toLocation: `Habitación ${room.number}`, reference: 'Carga inicial de habitación', createdByUserId: scope.userId },
          });
        }
      }
    });
    return { loaded: dot.length };
  },
};
