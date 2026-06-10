import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { hashPassword } from '../../shared/password';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { usersRepository } from './users.repository';
import type { CreateUserDto, UpdateUserDto } from './users.schema';

const SORTABLE = ['name', 'email', 'createdAt', 'status'] as const;

type UserRecord = NonNullable<Awaited<ReturnType<typeof usersRepository.findById>>>;

function serialize(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    role: user.role,
    branchIds: user.branches.map((b) => b.branchId),
    createdAt: user.createdAt,
  };
}

/** Non-super-admins can only assign branches they themselves belong to. */
function assertBranchesInScope(scope: RequestScope, branchIds: string[]): void {
  if (scope.isSuperAdmin) return;
  const allowed = new Set(scope.branchIds);
  if (!branchIds.every((id) => allowed.has(id))) {
    throw new ForbiddenError('No puede asignar sucursales fuera de su alcance');
  }
}

export const usersService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const where: Prisma.UserWhereInput = {};
    if (!scope.isSuperAdmin) {
      where.branches = { some: { branchId: { in: scope.branchIds } } };
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { email: { contains: params.search } },
      ];
    }

    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      usersRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      usersRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async getById(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return serialize(user);
  },

  async create(scope: RequestScope, dto: CreateUserDto) {
    assertBranchesInScope(scope, dto.branchIds);
    if (await usersRepository.findByEmail(dto.email)) {
      throw new ConflictError('Ya existe un usuario con ese email');
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await usersRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      roleId: dto.roleId,
      status: dto.status,
      branchIds: dto.branchIds,
    });
    return serialize(user as UserRecord);
  },

  async update(scope: RequestScope, id: string, dto: UpdateUserDto) {
    const existing = await usersRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');
    if (dto.branchIds) assertBranchesInScope(scope, dto.branchIds);
    if (dto.email && dto.email !== existing.email) {
      const dup = await usersRepository.findByEmail(dto.email);
      if (dup && dup.id !== id) throw new ConflictError('Ya existe un usuario con ese email');
    }

    const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;
    const user = await usersRepository.update(id, {
      name: dto.name,
      email: dto.email,
      passwordHash,
      roleId: dto.roleId,
      status: dto.status,
      branchIds: dto.branchIds,
    });
    return serialize(user as UserRecord);
  },

  async remove(scope: RequestScope, id: string) {
    if (id === scope.userId) {
      throw new ForbiddenError('No puede eliminar su propio usuario');
    }
    const existing = await usersRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');
    return usersRepository.delete(id);
  },
};
