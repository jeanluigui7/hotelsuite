import type { Prisma, Schedule } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { schedulesRepository } from './schedules.repository';
import type { CreateScheduleDto, UpdateScheduleDto } from './schedules.schema';

const SORTABLE = ['name', 'startTime', 'createdAt', 'status'] as const;

function toCsv(days?: number[]): string | undefined {
  if (!days) return undefined;
  return [...new Set(days)].sort((a, b) => a - b).join(',');
}

/** Serializes daysOfWeek (CSV) back to a number[] for clients. */
function serialize(schedule: Schedule) {
  return {
    ...schedule,
    daysOfWeek: schedule.daysOfWeek ? schedule.daysOfWeek.split(',').filter(Boolean).map(Number) : [],
  };
}

export const schedulesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ScheduleWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      schedulesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      schedulesRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const item = await schedulesRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Horario no encontrado');
    }
    return item;
  },

  async getById(scope: RequestScope, id: string) {
    return serialize(await this.getEntity(scope, id));
  },

  async create(scope: RequestScope, dto: CreateScheduleDto) {
    const branchId = requireActiveBranch(scope);
    const created = await schedulesRepository.create({
      branchId,
      name: dto.name,
      startTime: dto.startTime,
      endTime: dto.endTime,
      daysOfWeek: toCsv(dto.daysOfWeek) ?? '',
      status: dto.status,
    });
    return serialize(created);
  },

  async update(scope: RequestScope, id: string, dto: UpdateScheduleDto) {
    await this.getEntity(scope, id);
    const updated = await schedulesRepository.update(id, {
      name: dto.name,
      startTime: dto.startTime,
      endTime: dto.endTime,
      daysOfWeek: toCsv(dto.daysOfWeek),
      status: dto.status,
    });
    return serialize(updated);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getEntity(scope, id);
    return schedulesRepository.delete(id);
  },
};
