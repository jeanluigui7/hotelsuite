import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { consumeFloorTx } from '../linen-admin/linen-admin.service';
import type { SaveInitialDto, LoadBaseDto, DoteLinenDto } from './room-inventory.schema';

async function getRoom(scope: RequestScope, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { roomType: { select: { id: true, name: true } } } });
  if (!room || room.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Habitación no encontrada');
  return room;
}

/**
 * Resuelve el "floor" del LinenStock que abastece a una habitación: el subalmacén que la
 * cubre (SubWarehouseRoom) y, si no hay cobertura, la torre/piso de la habitación.
 * (En los datos, LinenStock.floor === nombre del subalmacén === room.tower.)
 */
async function resolveRoomFloor(branchId: string, roomId: string, tower: string | null, floor: string | null): Promise<string | null> {
  const cover = await prisma.subWarehouseRoom.findFirst({ where: { branchId, roomId }, include: { subWarehouse: { select: { name: true } } } });
  return cover?.subWarehouse?.name ?? tower ?? floor ?? null;
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
      linenItemId: d.linenItemId,
      quantity: invMap.get(`${d.articleKind}|${d.name}`) ?? 0,
      source: 'dotacion' as const,
    }));
    // Artículos presentes en la habitación que no están en la dotación (extras).
    for (const i of inv) {
      if (!dotKeys.has(`${i.articleKind}|${i.name}`)) {
        rows.push({ name: i.name, articleKind: i.articleKind, category: null, baseQty: 0, required: false, allowExtra: true, linenItemId: i.linenItemId, quantity: i.quantity, source: 'extra' as never });
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

  /**
   * Ropa (prendas específicas) que tiene actualmente la habitación + la ropa disponible en
   * su piso (para dotar). `items` = lo que hay en la habitación; `floorAvailable` = REM+SUM
   * del piso por prenda. Alimenta la pantalla de dotación y la FASE 1 de limpieza.
   */
  async roomLinen(scope: RequestScope, roomId: string) {
    const room = await getRoom(scope, roomId);
    const branchId = room.branchId;
    const floor = await resolveRoomFloor(branchId, roomId, room.tower, room.floor);
    const [inv, linen, floorStock] = await Promise.all([
      prisma.roomInventory.findMany({ where: { roomId, articleKind: 'LINEN_REUSABLE', linenItemId: { not: null }, quantity: { gt: 0 } } }),
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, select: { id: true, name: true, type: true, color: true } }),
      floor ? prisma.linenStock.findMany({ where: { branchId, floor } }) : Promise.resolve([]),
    ]);
    const lmap = new Map(linen.map((l) => [l.id, l]));
    const items = inv.map((i) => {
      const l = i.linenItemId ? lmap.get(i.linenItemId) : undefined;
      return { linenItemId: i.linenItemId, name: l?.name ?? i.name, type: l?.type ?? 'ROPA', color: l?.color ?? null, quantity: i.quantity };
    });
    const floorAvailable = floorStock
      .map((s) => ({ linenItemId: s.linenItemId, ...lmap.get(s.linenItemId), available: s.rem + s.sum }))
      .filter((x) => x.available > 0 && x.name)
      .map((x) => ({ linenItemId: x.linenItemId, name: x.name as string, type: x.type ?? 'ROPA', color: x.color ?? null, available: x.available }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { room: { id: room.id, number: room.number, floor: room.floor, tower: room.tower, roomType: room.roomType, linenFloor: floor }, items, floorAvailable };
  },

  /**
   * Dotación por prenda específica: coloca ropa exacta en la habitación DESCONTÁNDOLA del
   * piso (disponible REM+SUM, primero SUM). Registra el movimiento piso → habitación.
   */
  async doteLinen(scope: RequestScope, roomId: string, dto: DoteLinenDto) {
    const room = await getRoom(scope, roomId);
    const branchId = room.branchId;
    const floor = await resolveRoomFloor(branchId, roomId, room.tower, room.floor);
    if (!floor) throw new ValidationError('La habitación no tiene un piso/subalmacén asignado para tomar la ropa.');
    const ids = [...new Set(dto.items.map((i) => i.linenItemId))];
    const linen = await prisma.linenItem.findMany({ where: { id: { in: ids }, branchId }, select: { id: true, name: true, type: true } });
    if (linen.length !== ids.length) throw new ValidationError('Prenda de ropa no encontrada');
    const lmap = new Map(linen.map((l) => [l.id, l]));
    await prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        const l = lmap.get(it.linenItemId)!;
        // Descuenta del piso (lanza si el disponible REM+SUM es insuficiente).
        await consumeFloorTx(tx, it.linenItemId, floor, it.quantity);
        // Suma a la habitación (por prenda específica).
        const key = { roomId_articleKind_name: { roomId, articleKind: 'LINEN_REUSABLE', name: l.name } };
        const existing = await tx.roomInventory.findUnique({ where: key });
        await tx.roomInventory.upsert({
          where: key,
          update: { quantity: (existing?.quantity ?? 0) + it.quantity, linenItemId: it.linenItemId },
          create: { branchId, roomId, articleKind: 'LINEN_REUSABLE', name: l.name, linenItemId: it.linenItemId, quantity: it.quantity },
        });
        await tx.roomInventoryMovement.create({
          data: { branchId, roomId, type: 'ROOM_LOAD', articleKind: 'LINEN_REUSABLE', name: l.name, quantity: it.quantity, fromLocation: floor, toLocation: `Habitación ${room.number}`, reference: 'Dotación de ropa a la habitación', note: dto.note || null, createdByUserId: scope.userId },
        });
        await tx.linenMovement.create({
          data: { branchId, linenItemId: it.linenItemId, type: 'SUPPLY', quantity: -it.quantity, floor, areaFrom: floor, areaTo: `Hab. ${room.number}`, reference: 'Dotación a habitación', createdByUserId: scope.userId },
        });
      }
    });
    return { ok: true, items: dto.items.length };
  },
};
