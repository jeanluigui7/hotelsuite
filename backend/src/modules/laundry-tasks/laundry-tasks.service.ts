import type { LaundryTask, Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { laundryTasksRepository } from './laundry-tasks.repository';
import type { CreateLaundryTaskDto, UpdateLaundryTaskDto } from './laundry-tasks.schema';

async function machineMap(branchId: string) {
  const machines = await prisma.laundryMachine.findMany({ where: { branchId }, select: { id: true, name: true } });
  return new Map(machines.map((m) => [m.id, m.name]));
}

function serialize(t: LaundryTask, machines: Map<string, string>) {
  return {
    id: t.id,
    machineId: t.machineId,
    machineName: t.machineId ? (machines.get(t.machineId) ?? null) : null,
    description: t.description,
    status: t.status,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
  };
}

async function assertMachine(machineId: string | null | undefined, branchId: string): Promise<void> {
  if (!machineId) return;
  const m = await prisma.laundryMachine.findUnique({ where: { id: machineId } });
  if (!m || m.branchId !== branchId) throw new ValidationError('Máquina inválida');
}

export const laundryTasksService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.LaundryTaskWhereInput = { branchId };
    if (status) where.status = status;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      laundryTasksRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      laundryTasksRepository.count(where),
    ]);
    const machines = await machineMap(branchId);
    return { items: rows.map((t) => serialize(t, machines)), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const t = await laundryTasksRepository.findById(id);
    if (!t || t.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Carga no encontrada');
    return t;
  },

  async create(scope: RequestScope, dto: CreateLaundryTaskDto) {
    const branchId = requireActiveBranch(scope);
    await assertMachine(dto.machineId, branchId);
    const t = await laundryTasksRepository.create({
      branchId,
      machineId: dto.machineId ?? null,
      description: dto.description,
      status: dto.status,
      createdByUserId: scope.userId,
    });
    return serialize(t, await machineMap(branchId));
  },

  async update(scope: RequestScope, id: string, dto: UpdateLaundryTaskDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertMachine(dto.machineId, branchId);
    const t = await laundryTasksRepository.update(id, {
      machineId: dto.machineId === undefined ? undefined : dto.machineId,
      description: dto.description,
      status: dto.status,
      completedAt: dto.status === 'DONE' ? new Date() : undefined,
    });
    return serialize(t, await machineMap(branchId));
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return laundryTasksRepository.delete(id);
  },
};
