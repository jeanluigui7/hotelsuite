import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

export const activityLogService = {
  async list(scope: RequestScope, params: PaginationParams, module?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ActivityLogWhereInput = {
      OR: [{ branchId }, { branchId: null }],
    };
    if (module) where.module = module;
    if (params.search) where.summary = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.activityLog.count({ where }),
    ]);
    return { items, meta: pageMeta(params, total) };
  },
};
