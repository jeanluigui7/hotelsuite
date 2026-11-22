import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { RequestScope } from '../../shared/context';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { hashPassword, generateTempPassword } from '../../shared/password';
import { sealSecret, openSecret } from '../../shared/secret-box';
import { SUPER_ADMIN_ROLE, roleRank, roleNamesAboveRank } from '../../shared/rbac';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { usersRepository } from './users.repository';
import { recordActivity } from '../activity-log/activity.emitter';
import type { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './users.schema';

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

/**
 * JERARQUÍA: un actor (no Super Admin) solo puede gestionar usuarios cuyo rol sea de rango
 * <= al suyo. Bloquea tocar al Super Admin, al Gerente y a cualquier rol superior.
 * (El Super Admin siempre pasa; además su blindaje específico sigue en cada método.)
 */
function assertCanManageTarget(scope: RequestScope, targetRoleName: string | null | undefined): void {
  if (scope.isSuperAdmin) return;
  if (roleRank(targetRoleName) > roleRank(scope.roleName)) {
    throw new ForbiddenError('No puede gestionar usuarios de un rol superior al suyo');
  }
}

/**
 * JERARQUÍA: un actor (no Super Admin) solo puede asignar un rol de rango <= al suyo.
 * Impide asignar roles superiores y elevar la propia jerarquía (p. ej. auto-ascenderse a Gerente).
 */
async function assertCanAssignRole(scope: RequestScope, roleId: string | undefined): Promise<void> {
  if (scope.isSuperAdmin || !roleId) return;
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
  if (role && roleRank(role.name) > roleRank(scope.roleName)) {
    throw new ForbiddenError('No puede asignar un rol de jerarquía superior a la suya');
  }
}

export const usersService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const where: Prisma.UserWhereInput = {};
    if (!scope.isSuperAdmin) {
      where.branches = { some: { branchId: { in: scope.branchIds } } };
      // JERARQUÍA: oculta del listado a los usuarios de rol superior (Super Admin, Gerente, …).
      const hidden = roleNamesAboveRank(roleRank(scope.roleName));
      if (hidden.length) where.role = { name: { notIn: hidden } };
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

  async getById(scope: RequestScope, id: string) {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    assertCanManageTarget(scope, user.role?.name); // JERARQUÍA: no ver usuarios de rol superior
    return serialize(user);
  },

  /** Roles que el actor puede ASIGNAR (rango <= al suyo). Alimenta el selector del formulario de usuario. */
  async assignableRoles(scope: RequestScope) {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } });
    if (scope.isSuperAdmin) return roles;
    const max = roleRank(scope.roleName);
    return roles.filter((r) => roleRank(r.name) <= max);
  },

  async create(scope: RequestScope, dto: CreateUserDto) {
    assertBranchesInScope(scope, dto.branchIds);
    await assertCanAssignRole(scope, dto.roleId); // JERARQUÍA: no asignar roles superiores
    if (await usersRepository.findByEmail(dto.email)) {
      throw new ConflictError('Ya existe un usuario con ese email');
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await usersRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      passwordEnc: sealSecret(dto.password),
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
    assertCanManageTarget(scope, existing.role?.name); // JERARQUÍA: no editar usuarios de rol superior
    await assertCanAssignRole(scope, dto.roleId);       // JERARQUÍA: no ascender a un rol superior
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
      passwordEnc: dto.password ? sealSecret(dto.password) : undefined,
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

  /**
   * Restablecimiento administrativo de contraseña. Genera (o acepta) una clave temporal,
   * fuerza el cambio en el próximo ingreso, cierra las sesiones del usuario y devuelve la
   * clave temporal UNA sola vez. Nunca se almacena en texto plano.
   */
  async resetPassword(scope: RequestScope, id: string, dto: ResetPasswordDto) {
    const existing = await usersRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');
    assertCanManageTarget(scope, existing.role?.name); // JERARQUÍA: no restablecer claves de rol superior
    // Alcance: un no-super-admin solo puede restablecer usuarios de sus sucursales.
    if (!scope.isSuperAdmin) {
      const allowed = new Set(scope.branchIds);
      if (!existing.branches.some((b) => allowed.has(b.branchId))) {
        throw new ForbiddenError('No puede restablecer usuarios fuera de su alcance');
      }
    }
    // BLINDAJE: al Super Admin NO se le aplica el restablecimiento con clave aleatoria/forzada
    // (eso cierra su sesión y lo puede dejar fuera). Solo se le permite ASIGNAR una clave elegida
    // (password presente + forceChange=false).
    if (existing.role?.name === SUPER_ADMIN_ROLE && !(dto.password && dto.forceChange === false)) {
      throw new ForbiddenError('Al Super Admin solo se le puede ASIGNAR una contraseña que tú elijas (no restablecer con clave aleatoria).');
    }
    const temporaryPassword = dto.password ?? generateTempPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    // forceChange=false => el admin ASIGNA una clave fija que él conoce (no se obliga a cambiarla).
    const forceChange = dto.forceChange ?? true;
    await prisma.user.update({
      where: { id },
      data: { passwordHash, passwordEnc: sealSecret(temporaryPassword), mustChangePassword: forceChange },
    });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    void recordActivity(scope, {
      activity: 'USER_PASSWORD_RESET', area: 'USUARIOS', entityId: id, reference: `Usuario ${existing.name}`,
      detail: `${forceChange ? 'Restablecimiento' : 'Asignación'} administrativa de contraseña para ${existing.name}`,
      meta: { user: existing.name, email: existing.email, passwordReset: true, forced: forceChange },
    });
    return { temporaryPassword };
  },

  /**
   * Devuelve la contraseña actual en claro. SOLO para el cargo máximo (Super Admin). Queda auditado
   * quién consultó la clave de quién. Las contraseñas anteriores a esta función no están registradas.
   */
  async viewPassword(scope: RequestScope, id: string) {
    if (!scope.isSuperAdmin) throw new ForbiddenError('Solo el cargo máximo puede ver contraseñas.');
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    const full = await prisma.user.findUnique({ where: { id }, select: { passwordEnc: true } });
    const password = openSecret(full?.passwordEnc);
    void recordActivity(scope, {
      activity: 'USER_PASSWORD_VIEW', area: 'USUARIOS', entityId: id, reference: `Usuario ${user.name}`,
      detail: `Consulta de contraseña de ${user.name}`,
      meta: { user: user.name, email: user.email, available: !!password },
    });
    return { available: !!password, password: password ?? null };
  },

  async remove(scope: RequestScope, id: string) {
    if (id === scope.userId) {
      throw new ForbiddenError('No puede desactivar su propio usuario');
    }
    const existing = await usersRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');
    assertCanManageTarget(scope, existing.role?.name); // JERARQUÍA: no desactivar usuarios de rol superior
    if (existing.role?.name === SUPER_ADMIN_ROLE) {
      throw new ForbiddenError('No se puede eliminar ni desactivar al Super Admin.');
    }
    // BLINDAJE: soft-delete. En vez de DESTRUIR el usuario (irreversible), se DESACTIVA (status=inactive).
    // El login ya rechaza a los no-activos; se puede reactivar sin pérdida. Se cierran sus sesiones.
    const out = await usersRepository.update(id, { status: 'inactive' });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    void recordActivity(scope, {
      activity: 'USER_DEACTIVATE', area: 'USUARIOS', entityId: id, reference: `Usuario ${existing.name}`,
      detail: `Usuario ${existing.name} desactivado`,
      meta: { user: existing.name, email: existing.email, role: existing.role?.name ?? null },
    });
    return out;
  },
};
