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
import { recordActivity } from '../activity-log/activity.emitter';
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
    void recordActivity(scope, {
      activity: 'USER_CREATE', area: 'USUARIOS', entityId: user.id, reference: `Usuario ${user.name}`,
      detail: `Usuario ${user.name} creado · Rol ${user.role?.name ?? '—'}`,
      meta: { user: user.name, email: user.email, role: user.role?.name ?? null, status: user.status },
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
    const user = (await usersRepository.update(id, {
      name: dto.name,
      email: dto.email,
      passwordHash,
      roleId: dto.roleId,
      status: dto.status,
      branchIds: dto.branchIds,
    })) as UserRecord;
    // Un evento por el cambio más significativo (nunca se registra la contraseña, solo el hecho).
    const pwReset = !!dto.password;
    const deactivated = existing.status === 'active' && dto.status === 'inactive';
    const reactivated = existing.status === 'inactive' && dto.status === 'active';
    const roleChanged = dto.roleId !== undefined && existing.role?.id !== user.role?.id;
    let activity: 'USER_PASSWORD_RESET' | 'USER_DEACTIVATE' | 'USER_UPDATE' = 'USER_UPDATE';
    let detail = `Usuario ${user.name} modificado`;
    if (pwReset) { activity = 'USER_PASSWORD_RESET'; detail = `Restablecimiento administrativo de contraseña para ${user.name}`; }
    else if (deactivated) { activity = 'USER_DEACTIVATE'; detail = `Usuario ${user.name} desactivado`; }
    else if (roleChanged) { detail = `${user.name} · Rol ${existing.role?.name ?? '—'} → ${user.role?.name ?? '—'}`; }
    else if (reactivated) { detail = `Usuario ${user.name} reactivado`; }
    void recordActivity(scope, {
      activity, area: 'USUARIOS', entityId: user.id, reference: `Usuario ${user.name}`, detail,
      meta: { user: user.name, email: user.email, roleBefore: existing.role?.name ?? null, roleAfter: user.role?.name ?? null, statusBefore: existing.status, statusAfter: user.status, passwordReset: pwReset },
    });
    return serialize(user as UserRecord);
  },

  async remove(scope: RequestScope, id: string) {
    if (id === scope.userId) {
      throw new ForbiddenError('No puede eliminar su propio usuario');
    }
    const existing = await usersRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');
    const out = await usersRepository.delete(id);
    void recordActivity(scope, {
      activity: 'USER_DEACTIVATE', area: 'USUARIOS', entityId: id, reference: `Usuario ${existing.name}`,
      detail: `Usuario ${existing.name} eliminado`,
      meta: { user: existing.name, email: existing.email, role: existing.role?.name ?? null },
    });
    return out;
  },
};
