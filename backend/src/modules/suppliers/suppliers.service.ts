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
import { suppliersRepository } from './suppliers.repository';
import type { CreateSupplierDto, UpdateSupplierDto } from './suppliers.schema';

const SORTABLE = ['name', 'createdAt', 'status'] as const;

export const suppliersService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.SupplierWhereInput = { branchId };
    if (params.search) where.name = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      suppliersRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      suppliersRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(scope: RequestScope, id: string) {
    const item = await suppliersRepository.findById(id);
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Proveedor no encontrado');
    return item;
  },

  create(scope: RequestScope, dto: CreateSupplierDto) {
    const branchId = requireActiveBranch(scope);
    return suppliersRepository.create({
      branchId,
      name: dto.name,
      taxId: dto.taxId || null,
      contact: dto.contact || null,
      phone: dto.phone || null,
      email: dto.email || null,
      status: dto.status,
    });
  },

  async update(scope: RequestScope, id: string, dto: UpdateSupplierDto) {
    await this.getById(scope, id);
    return suppliersRepository.update(id, {
      name: dto.name,
      taxId: dto.taxId === '' ? null : dto.taxId,
      contact: dto.contact === '' ? null : dto.contact,
      phone: dto.phone === '' ? null : dto.phone,
      email: dto.email === '' ? null : dto.email,
      status: dto.status,
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    const purchases = await suppliersRepository.countPurchases(id);
    if (purchases > 0) throw new ValidationError('No se puede eliminar un proveedor con ingresos registrados');
    return suppliersRepository.delete(id);
  },
};
