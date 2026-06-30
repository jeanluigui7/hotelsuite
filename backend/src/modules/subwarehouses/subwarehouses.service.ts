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

export const subWarehousesService = {
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
