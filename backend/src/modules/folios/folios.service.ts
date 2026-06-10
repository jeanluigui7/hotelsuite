import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { Prisma as PrismaNS } from '@prisma/client';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { foliosRepository } from './folios.repository';
import type { CreateFolioSeriesDto, UpdateFolioSeriesDto } from './folios.schema';

const SORTABLE = ['documentType', 'series', 'createdAt'] as const;

export const foliosService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.FolioSeriesWhereInput = { branchId };
    if (params.search) where.series = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      foliosRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'documentType') }),
      foliosRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await foliosRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Serie no encontrada');
    return item;
  },

  async create(scope: RequestScope, dto: CreateFolioSeriesDto) {
    const branchId = requireActiveBranch(scope);
    try {
      return await foliosRepository.create({ branchId, ...dto });
    } catch (err) {
      if (err instanceof PrismaNS.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Ya existe esa serie para el tipo de documento');
      }
      throw err;
    }
  },

  async update(scope: RequestScope, id: string, dto: UpdateFolioSeriesDto) {
    await this.getById(scope, id);
    return foliosRepository.update(id, dto);
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    return foliosRepository.delete(id);
  },
};
