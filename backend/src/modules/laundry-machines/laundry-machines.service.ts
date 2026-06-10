import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { laundryMachinesRepository } from './laundry-machines.repository';
import type { CreateLaundryMachineDto, UpdateLaundryMachineDto } from './laundry-machines.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

export const laundryMachinesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.LaundryMachineWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      laundryMachinesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      laundryMachinesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await laundryMachinesRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Máquina no encontrada');
    return item;
  },

  create(scope: RequestScope, dto: CreateLaundryMachineDto) {
    const branchId = requireActiveBranch(scope);
    return laundryMachinesRepository.create({
      branchId,
      name: dto.name,
      capacity: dto.capacity || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateLaundryMachineDto) {
    await this.getById(scope, id);
    return laundryMachinesRepository.update(id, {
      name: dto.name,
      capacity: dto.capacity === '' ? null : dto.capacity,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return laundryMachinesRepository.delete(id);
  },
};
