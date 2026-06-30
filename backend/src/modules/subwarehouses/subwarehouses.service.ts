import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import type { CreateSubWarehouseDto, UpdateSubWarehouseDto, SetRoomsDto } from './subwarehouses.schema';

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
};
