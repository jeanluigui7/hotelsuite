import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { branchesRepository } from './branches.repository';
import type { CreateBranchDto, UpdateBranchDto } from './branches.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

export const branchesService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const where: Prisma.BranchWhereInput = {};
    // Non-super-admins only see the branches they belong to.
    if (!scope.isSuperAdmin) {
      where.id = { in: scope.branchIds };
    }
    if (params.search) {
      where.name = { contains: params.search };
    }

    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      branchesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      branchesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(id: string) {
    const branch = await branchesRepository.findById(id);
    if (!branch) throw new NotFoundError('Sucursal no encontrada');
    return branch;
  },

  create(dto: CreateBranchDto) {
    return branchesRepository.create(dto);
  },

  async update(id: string, dto: UpdateBranchDto) {
    await this.getById(id);
    return branchesRepository.update(id, dto);
  },

  async remove(id: string) {
    await this.getById(id);
    return branchesRepository.delete(id);
  },
};
