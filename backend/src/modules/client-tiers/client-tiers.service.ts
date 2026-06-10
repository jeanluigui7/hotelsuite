import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { clientTiersRepository } from './client-tiers.repository';
import type { CreateClientTierDto, UpdateClientTierDto } from './client-tiers.schema';

const SORTABLE = ['name', 'discountPercent', 'createdAt'] as const;

export const clientTiersService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.ClientTierWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };

    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      clientTiersRepository.list({
        where,
        skip,
        take,
        orderBy: buildOrderBy(params, SORTABLE, 'name'),
      }),
      clientTiersRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await clientTiersRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) {
      throw new NotFoundError('Tier no encontrado');
    }
    return item;
  },

  create(scope: RequestScope, dto: CreateClientTierDto) {
    const branchId = requireActiveBranch(scope);
    return clientTiersRepository.create({
      branchId,
      name: dto.name,
      discountPercent: dto.discountPercent,
      description: dto.description || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateClientTierDto) {
    await this.getById(scope, id);
    return clientTiersRepository.update(id, {
      name: dto.name,
      discountPercent: dto.discountPercent,
      description: dto.description === '' ? null : dto.description,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    const refs = await clientTiersRepository.countCustomRates(id);
    if (refs > 0) {
      throw new ValidationError('No se puede eliminar un tier con tarifas personalizadas asociadas');
    }
    return clientTiersRepository.delete(id);
  },
};
