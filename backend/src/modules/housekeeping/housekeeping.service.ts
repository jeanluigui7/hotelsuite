import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { housekeepingRepository, type TaskWithRelations } from './housekeeping.repository';
import type { CompleteTaskDto, CreateTaskDto, InspectTaskDto } from './housekeeping.schema';

function serialize(
  task: TaskWithRelations,
  rooms: Map<string, string>,
  users: Map<string, string>,
) {
  return {
    id: task.id,
    roomId: task.roomId,
    roomNumber: rooms.get(task.roomId) ?? '—',
    assignedToUserId: task.assignedToUserId,
    assignedToName: task.assignedToUserId ? (users.get(task.assignedToUserId) ?? null) : null,
    status: task.status,
    result: task.result,
    notes: task.notes,
    completedAt: task.completedAt,
    inspectedAt: task.inspectedAt,
    createdAt: task.createdAt,
    inspections: task.inspections.map((i) => ({
      checklistItemId: i.checklistItemId,
      passed: i.passed,
      note: i.note,
    })),
  };
}

async function maps(branchId: string) {
  const [rooms, users] = await Promise.all([
    prisma.room.findMany({ where: { branchId }, select: { id: true, number: true } }),
    prisma.user.findMany({
      where: { branches: { some: { branchId } } },
      select: { id: true, name: true },
    }),
  ]);
  return {
    rooms: new Map(rooms.map((r) => [r.id, r.number])),
    users: new Map(users.map((u) => [u.id, u.name])),
  };
}

async function assertRoom(roomId: string, branchId: string): Promise<string> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
  return room.number;
}

export const housekeepingService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.HousekeepingTaskWhereInput = { branchId };
    if (status) where.status = status;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      housekeepingRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      housekeepingRepository.count(where),
    ]);
    const m = await maps(branchId);
    return { items: rows.map((t) => serialize(t, m.rooms, m.users)), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const task = await housekeepingRepository.findById(id);
    if (!task || task.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Tarea no encontrada');
    return task;
  },

  async create(scope: RequestScope, dto: CreateTaskDto) {
    const branchId = requireActiveBranch(scope);
    await assertRoom(dto.roomId, branchId);
    const task = await housekeepingRepository.create({
      branchId,
      roomId: dto.roomId,
      assignedToUserId: dto.assignedToUserId ?? null,
      notes: dto.notes || null,
    });
    const m = await maps(branchId);
    return serialize(task, m.rooms, m.users);
  },

  async start(scope: RequestScope, id: string) {
    const task = await this.getEntity(scope, id);
    if (task.status !== 'PENDING') throw new ConflictError('La tarea ya fue iniciada');
    const updated = await housekeepingRepository.update(id, { status: 'IN_PROGRESS' });
    const m = await maps(task.branchId);
    return serialize(updated, m.rooms, m.users);
  },

  async complete(scope: RequestScope, id: string, dto: CompleteTaskDto) {
    const branchId = requireActiveBranch(scope);
    const task = await this.getEntity(scope, id);
    if (task.status === 'INSPECTED') throw new ConflictError('La tarea ya fue inspeccionada');
    const roomNumber = await assertRoom(task.roomId, branchId);
    // Validate warehouses/products belong to the branch.
    for (const c of dto.consumption) {
      const [product, warehouse] = await Promise.all([
        prisma.product.findUnique({ where: { id: c.productId } }),
        prisma.warehouse.findUnique({ where: { id: c.warehouseId } }),
      ]);
      if (!product || product.branchId !== branchId) throw new ValidationError('Producto inválido');
      if (!warehouse || warehouse.branchId !== branchId) throw new ValidationError('Almacén inválido');
    }
    try {
      const updated = await housekeepingRepository.complete({
        id,
        branchId,
        roomNumber,
        consumption: dto.consumption,
        userId: scope.userId,
      });
      const m = await maps(branchId);
      return serialize(updated, m.rooms, m.users);
    } catch (err) {
      if (err instanceof Error && err.message === 'STOCK_INSUFFICIENT') {
        throw new ValidationError('Stock insuficiente para el consumo de amenities');
      }
      throw err;
    }
  },

  async inspect(scope: RequestScope, id: string, dto: InspectTaskDto) {
    const branchId = requireActiveBranch(scope);
    const task = await this.getEntity(scope, id);
    const updated = await housekeepingRepository.inspect({
      id,
      roomId: task.roomId,
      approved: dto.approved,
      items: dto.items.map((i) => ({ checklistItemId: i.checklistItemId, passed: i.passed, note: i.note || null })),
      userId: scope.userId,
    });
    const m = await maps(branchId);
    return serialize(updated, m.rooms, m.users);
  },
};
