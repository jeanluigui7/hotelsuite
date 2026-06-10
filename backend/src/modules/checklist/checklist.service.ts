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
import { checklistRepository } from './checklist.repository';
import type { CreateChecklistItemDto, UpdateChecklistItemDto } from './checklist.schema';

const SORTABLE = ['name', 'createdAt'] as const;

export const checklistService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ChecklistItemWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      checklistRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      checklistRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await checklistRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Ítem no encontrado');
    return item;
  },

  create(scope: RequestScope, dto: CreateChecklistItemDto) {
    const branchId = requireActiveBranch(scope);
    return checklistRepository.create({ branchId, ...dto });
  },

  async update(scope: RequestScope, id: string, dto: UpdateChecklistItemDto) {
    await this.getById(scope, id);
    return checklistRepository.update(id, dto);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return checklistRepository.delete(id);
  },
};
