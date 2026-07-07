import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { addLocationStock } from '../laundry/location-stock';
import type { CreateSubWarehouseDto, UpdateSubWarehouseDto, SetRoomsDto, SetStockDto, SupplyDto } from './subwarehouses.schema';

async function getArea(scope: RequestScope, areaId: string) {
  const area = await prisma.area.findUnique({ where: { id: areaId } });
  if (!area || area.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Área no encontrada');
  return area;
}
async function getSub(scope: RequestScope, id: string) {
  const sub = await prisma.subWarehouse.findUnique({ where: { id }, include: { area: true } });
  if (!sub || sub.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Subalmacén no encontrado');
  return sub;
}

/** Tipo de área que agrupa los subalmacenes de ropa (pisos/torres). */
const LINEN_AREA_TYPE = 'ROPA';

export const subWarehousesService = {
  /**
   * Área de ropa (managesSubwarehouses) ligada al almacén CLEANING "ROPA - LIMPIEZA".
   * La crea si no existe. Es el contenedor de los subalmacenes (pisos/torres) desde donde
   * la habitación jala su ropa. Devuelve el área, el almacén y sus subalmacenes activos.
   */
  async linenArea(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const wh =
      (await prisma.warehouse.findFirst({ where: { branchId, type: 'CLEANING', name: 'ROPA - LIMPIEZA' } })) ??
      (await prisma.warehouse.findFirst({ where: { branchId, type: 'CLEANING' } }));
    let area = await prisma.area.findFirst({ where: { branchId, type: LINEN_AREA_TYPE, managesSubwarehouses: true } });
    if (!area) {
      area = await prisma.area.create({ data: { branchId, name: 'ROPA - LIMPIEZA', type: LINEN_AREA_TYPE, managesSubwarehouses: true, warehouseId: wh?.id ?? null, status: 'active' } });
    } else if (wh && area.warehouseId !== wh.id) {
      area = await prisma.area.update({ where: { id: area.id }, data: { warehouseId: wh.id } });
    }
    const subWarehouses = await prisma.subWarehouse.findMany({ where: { areaId: area.id, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return { areaId: area.id, warehouseId: wh?.id ?? null, subWarehouses };
  },

  /**
   * Asigna (o quita) una habitación a un subalmacén de ropa desde la edición de la habitación.
   * Mantiene la regla de no-solape: la habitación queda en un único subalmacén del tipo de área.
   */
  async assignRoom(scope: RequestScope, roomId: string, subWarehouseId: string | null) {
    const branchId = requireActiveBranch(scope);
    if (!subWarehouseId) {
      await prisma.subWarehouseRoom.deleteMany({ where: { roomId, subWarehouse: { area: { type: LINEN_AREA_TYPE } } } });
      return;
    }
    const sub = await prisma.subWarehouse.findUnique({ where: { id: subWarehouseId }, include: { area: true } });
    if (!sub || sub.branchId !== branchId) throw new ValidationError('Subalmacén no encontrado');
    await prisma.$transaction(async (tx) => {
      await tx.subWarehouseRoom.deleteMany({ where: { roomId, subWarehouse: { area: { type: sub.area.type } } } });
      await tx.subWarehouseRoom.create({ data: { branchId, subWarehouseId, roomId } });
    });
  },

  /** Subalmacén (de ropa) al que está asignada una habitación, si existe. */
  async roomAssignment(scope: RequestScope, roomId: string) {
    requireActiveBranch(scope);
    const row = await prisma.subWarehouseRoom.findFirst({ where: { roomId, subWarehouse: { area: { type: LINEN_AREA_TYPE } } }, select: { subWarehouseId: true } });
    return { subWarehouseId: row?.subWarehouseId ?? null };
  },

  async list(scope: RequestScope, areaId: string) {
    await getArea(scope, areaId);
    const subs = await prisma.subWarehouse.findMany({ where: { areaId }, include: { rooms: { select: { roomId: true } } }, orderBy: { name: 'asc' } });
    return subs.map((s) => ({ id: s.id, name: s.name, coverageType: s.coverageType, status: s.status, roomIds: s.rooms.map((r) => r.roomId), roomCount: s.rooms.length }));
  },

  async create(scope: RequestScope, dto: CreateSubWarehouseDto) {
    const branchId = requireActiveBranch(scope);
    await getArea(scope, dto.areaId);
    return prisma.subWarehouse.create({ data: { branchId, areaId: dto.areaId, name: dto.name, coverageType: dto.coverageType, status: dto.status } });
  },

  async update(scope: RequestScope, id: string, dto: UpdateSubWarehouseDto) {
    await getSub(scope, id);
    return prisma.subWarehouse.update({ where: { id }, data: { name: dto.name, coverageType: dto.coverageType, status: dto.status } });
  },

  async remove(scope: RequestScope, id: string) {
    await getSub(scope, id);
    return prisma.subWarehouse.delete({ where: { id } });
  },

  /** Habitaciones de la sucursal con su torre/piso y a qué subalmacén de ESTA área están asignadas. */
  async coverageRooms(scope: RequestScope, areaId: string) {
    const branchId = requireActiveBranch(scope);
    await getArea(scope, areaId);
    const [rooms, subs] = await Promise.all([
      prisma.room.findMany({ where: { branchId }, select: { id: true, number: true, floor: true, tower: true, roomType: { select: { name: true } } }, orderBy: [{ tower: 'asc' }, { floor: 'asc' }, { number: 'asc' }] }),
      prisma.subWarehouse.findMany({ where: { areaId }, select: { id: true, rooms: { select: { roomId: true } } } }),
    ]);
    const assign = new Map<string, string>();
    for (const s of subs) for (const r of s.rooms) assign.set(r.roomId, s.id);
    return rooms.map((r) => ({ id: r.id, number: r.number, floor: r.floor, tower: r.tower, roomType: r.roomType?.name ?? null, subWarehouseId: assign.get(r.id) ?? null }));
  },

  /**
   * Fija la cobertura del subalmacén. Regla: una habitación pertenece a un solo subalmacén
   * dentro de áreas del MISMO tipo → se quita de subalmacenes hermanos (semántica de "mover").
   */
  async setRooms(scope: RequestScope, id: string, dto: SetRoomsDto) {
    const branchId = requireActiveBranch(scope);
    const sub = await getSub(scope, id);
    // Validar que las habitaciones sean de la sucursal.
    if (dto.roomIds.length) {
      const count = await prisma.room.count({ where: { id: { in: dto.roomIds }, branchId } });
      if (count !== dto.roomIds.length) throw new ValidationError('Alguna habitación no pertenece a la sucursal');
    }
    // Subalmacenes hermanos: los de áreas del mismo tipo en la sucursal (excepto este).
    const siblingAreas = await prisma.area.findMany({ where: { branchId, type: sub.area.type }, select: { id: true } });
    const siblingSubs = await prisma.subWarehouse.findMany({ where: { areaId: { in: siblingAreas.map((a) => a.id) }, id: { not: id } }, select: { id: true } });
    const siblingIds = siblingSubs.map((s) => s.id);

    await prisma.$transaction(async (tx) => {
      if (siblingIds.length && dto.roomIds.length) {
        await tx.subWarehouseRoom.deleteMany({ where: { subWarehouseId: { in: siblingIds }, roomId: { in: dto.roomIds } } });
      }
      await tx.subWarehouseRoom.deleteMany({ where: { subWarehouseId: id } });
      if (dto.roomIds.length) {
        await tx.subWarehouseRoom.createMany({ data: dto.roomIds.map((roomId) => ({ branchId, subWarehouseId: id, roomId })) });
      }
    });
    return { assigned: dto.roomIds.length };
  },

  /**
   * Necesidad de ropa del subalmacén (fuente ÚNICA = stock por piso, LinenStock):
   *  - required: dotación base (RoomTypeDotacion activa) × habitaciones que atiende, por artículo.
   *  - available: stock real disponible (rem) en los PISOS que cubre el subalmacén, por artículo de ropa.
   * Ya no usa SubWarehouseStock (sistema paralelo obsoleto): todo se lee del stock por piso.
   */
  async needs(scope: RequestScope, id: string) {
    const sub = await getSub(scope, id);
    const branchId = sub.branchId;
    const links = await prisma.subWarehouseRoom.findMany({ where: { subWarehouseId: id }, select: { room: { select: { roomTypeId: true, floor: true } } } });
    const typeCounts = new Map<string, number>();
    const floors = new Set<string>();
    for (const l of links) {
      typeCounts.set(l.room.roomTypeId, (typeCounts.get(l.room.roomTypeId) ?? 0) + 1);
      if (l.room.floor) floors.add(l.room.floor);
    }
    // Requerido por la dotación de los tipos de habitación que atiende.
    const req = new Map<string, { articleKind: string; name: string; size: string | null; required: number }>();
    if (typeCounts.size) {
      const dots = await prisma.roomTypeDotacion.findMany({ where: { branchId, status: 'active', roomTypeId: { in: [...typeCounts.keys()] } } });
      for (const d of dots) {
        const count = typeCounts.get(d.roomTypeId) ?? 0;
        const key = `${d.articleKind}|${d.name}|${d.size ?? ''}`;
        const cur = req.get(key) ?? { articleKind: d.articleKind, name: d.name, size: d.size ?? null, required: 0 };
        cur.required += d.baseQty * count;
        req.set(key, cur);
      }
    }
    // Disponible real: stock por piso (LinenStock) de los pisos que cubre el subalmacén.
    let available: { type: string; name: string; rem: number }[] = [];
    if (floors.size) {
      const stock = await prisma.linenStock.findMany({ where: { branchId, floor: { in: [...floors] } } });
      const byItem = new Map<string, number>();
      for (const s of stock) byItem.set(s.linenItemId, (byItem.get(s.linenItemId) ?? 0) + s.rem);
      const litems = byItem.size ? await prisma.linenItem.findMany({ where: { id: { in: [...byItem.keys()] } }, select: { id: true, type: true, name: true } }) : [];
      available = litems.map((it) => ({ type: it.type, name: it.name, rem: byItem.get(it.id) ?? 0 })).filter((x) => x.rem);
    }
    return { rooms: links.length, floors: [...floors], required: [...req.values()], available };
  },

  /** Stock propio del subalmacén. */
  async getStock(scope: RequestScope, id: string) {
    await getSub(scope, id);
    const rows = await prisma.subWarehouseStock.findMany({ where: { subWarehouseId: id }, orderBy: [{ articleKind: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => ({ articleKind: r.articleKind, name: r.name, linenItemId: r.linenItemId, quantity: r.quantity }));
  },

  /** Fija (set absoluto) el stock del subalmacén y registra los ajustes en el kardex. */
  async setStock(scope: RequestScope, id: string, dto: SetStockDto) {
    const sub = await getSub(scope, id);
    const branchId = sub.branchId;
    await prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        const key = { subWarehouseId_articleKind_name: { subWarehouseId: id, articleKind: it.articleKind, name: it.name } };
        const existing = await tx.subWarehouseStock.findUnique({ where: key });
        const delta = it.quantity - (existing?.quantity ?? 0);
        await tx.subWarehouseStock.upsert({
          where: key,
          update: { quantity: it.quantity, ...(it.linenItemId ? { linenItemId: it.linenItemId } : {}) },
          create: { branchId, subWarehouseId: id, articleKind: it.articleKind, name: it.name, linenItemId: it.linenItemId || null, quantity: it.quantity },
        });
        if (delta !== 0) {
          await tx.roomInventoryMovement.create({
            data: { branchId, roomId: null, type: delta > 0 ? 'ADJUST_POS' : 'ADJUST_NEG', articleKind: it.articleKind, name: it.name, quantity: delta, toLocation: `Subalmacén ${sub.name}`, reference: 'Ajuste de stock del subalmacén', createdByUserId: scope.userId },
          });
        }
      }
    });
    return { ok: true };
  },

  /** Suministra ropa desde la Ropa Limpia Central al subalmacén (Central → Subalmacén). */
  async supply(scope: RequestScope, id: string, dto: SupplyDto) {
    const sub = await getSub(scope, id);
    const branchId = sub.branchId;
    // Validar disponibilidad en el central de ropa limpia.
    for (const it of dto.items) {
      const c = await prisma.linenLocationStock.findUnique({ where: { branchId_location_articleKind_name: { branchId, location: 'CLEAN_CENTRAL', articleKind: it.articleKind, name: it.name } } });
      if (!c || c.quantity < it.quantity) {
        throw new ValidationError(`Stock insuficiente de "${it.name}" en la Ropa Limpia Central (disponible ${c?.quantity ?? 0}, solicitado ${it.quantity}).`);
      }
    }
    await prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        await addLocationStock(tx, branchId, 'CLEAN_CENTRAL', it.articleKind, it.name, -it.quantity);
        const key = { subWarehouseId_articleKind_name: { subWarehouseId: id, articleKind: it.articleKind, name: it.name } };
        await tx.subWarehouseStock.upsert({
          where: key,
          update: { quantity: { increment: it.quantity } },
          create: { branchId, subWarehouseId: id, articleKind: it.articleKind, name: it.name, quantity: it.quantity },
        });
        await tx.roomInventoryMovement.create({
          data: { branchId, roomId: null, type: 'TRANSFER', articleKind: it.articleKind, name: it.name, quantity: it.quantity, fromLocation: 'Almacén de Ropa Limpia Central', toLocation: `Subalmacén ${sub.name}`, reference: 'Suministro a subalmacén', createdByUserId: scope.userId },
        });
      }
    });
    return { supplied: dto.items.length };
  },
};
