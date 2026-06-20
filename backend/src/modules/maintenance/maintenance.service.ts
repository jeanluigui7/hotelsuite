import type { Maintenance, Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { maintenanceRepository } from './maintenance.repository';
import type { CreateMaintenanceDto, UpdateMaintenanceDto } from './maintenance.schema';

async function roomMap(branchId: string) {
  const rooms = await prisma.room.findMany({ where: { branchId }, select: { id: true, number: true } });
  return new Map(rooms.map((r) => [r.id, r.number]));
}

function serialize(m: Maintenance, rooms: Map<string, string>) {
  return {
    id: m.id,
    roomId: m.roomId,
    roomNumber: m.roomId ? (rooms.get(m.roomId) ?? null) : null,
    title: m.title,
    description: m.description,
    status: m.status,
    cost: m.cost,
    scheduledAt: m.scheduledAt,
    completedAt: m.completedAt,
    createdAt: m.createdAt,
  };
}

async function assertRoom(roomId: string | null | undefined, branchId: string): Promise<void> {
  if (!roomId) return;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
}

export const maintenanceService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.MaintenanceWhereInput = { branchId };
    if (status) where.status = status;
    if (params.search) where.title = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      maintenanceRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      maintenanceRepository.count(where),
    ]);
    const rooms = await roomMap(branchId);
    return { items: rows.map((m) => serialize(m, rooms)), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const m = await maintenanceRepository.findById(id);
    if (!m || m.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Mantenimiento no encontrado');
    return m;
  },

  async create(scope: RequestScope, dto: CreateMaintenanceDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoom(dto.roomId, branchId);
    const m = await maintenanceRepository.create({
      branchId,
      roomId: dto.roomId ?? null,
      title: dto.title,
      description: dto.description || null,
      status: dto.status,
      cost: dto.cost ?? null,
      assignedToUserId: dto.assignedToUserId ?? null,
      scheduledAt: dto.scheduledAt ?? null,
      createdByUserId: scope.userId,
    });
    // Mantenimiento crítico bloquea la habitación (si no está ocupada) hasta resolverlo.
    if (dto.critical && dto.roomId && dto.status !== 'DONE' && dto.status !== 'CANCELLED') {
      const room = await prisma.room.findUnique({ where: { id: dto.roomId } });
      if (room && room.status !== 'OCCUPIED') {
        await prisma.room.update({ where: { id: dto.roomId }, data: { status: 'MAINTENANCE' } });
      }
    }
    return serialize(m, await roomMap(branchId));
  },

  async update(scope: RequestScope, id: string, dto: UpdateMaintenanceDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertRoom(dto.roomId, branchId);
    const m = await maintenanceRepository.update(id, {
      roomId: dto.roomId === undefined ? undefined : dto.roomId,
      title: dto.title,
      description: dto.description === '' ? null : dto.description,
      status: dto.status,
      cost: dto.cost,
      assignedToUserId: dto.assignedToUserId === undefined ? undefined : dto.assignedToUserId,
      scheduledAt: dto.scheduledAt === undefined ? undefined : dto.scheduledAt,
      completedAt: dto.status === 'DONE' ? new Date() : undefined,
    });
    // Al resolver (DONE/CANCELLED) se desbloquea la habitación: pasa a limpieza.
    if ((dto.status === 'DONE' || dto.status === 'CANCELLED') && m.roomId) {
      const room = await prisma.room.findUnique({ where: { id: m.roomId } });
      if (room && room.status === 'MAINTENANCE') {
        await prisma.room.update({ where: { id: m.roomId }, data: { status: 'CLEANING' } });
      }
    }
    return serialize(m, await roomMap(branchId));
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return maintenanceRepository.delete(id);
  },
};
