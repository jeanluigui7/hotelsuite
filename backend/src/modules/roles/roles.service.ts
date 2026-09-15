import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { recordActivity } from '../activity-log/activity.emitter';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { rolesRepository } from './roles.repository';
import type { CreateRoleDto, UpdateRoleDto } from './roles.schema';

const SORTABLE = ['name', 'createdAt'] as const;

type RoleWithPerms = NonNullable<Awaited<ReturnType<typeof rolesRepository.findById>>>;

function serialize(role: RoleWithPerms) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionIds: role.permissions.map((rp) => rp.permissionId),
    permissions: role.permissions.map((rp) => ({
      id: rp.permission.id,
      module: rp.permission.module,
      action: rp.permission.action,
    })),
  };
}

export const rolesService = {
  async list(params: PaginationParams) {
    const where: Prisma.RoleWhereInput = params.search
      ? { name: { contains: params.search } }
      : {};
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      rolesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'name') }),
      rolesRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(id: string) {
    const role = await rolesRepository.findById(id);
    if (!role) throw new NotFoundError('Rol no encontrado');
    return serialize(role);
  },

  async create(dto: CreateRoleDto) {
    if (await rolesRepository.findByName(dto.name)) {
      throw new ConflictError('Ya existe un rol con ese nombre');
    }
    const role = await rolesRepository.create(dto);
    return serialize(role as RoleWithPerms);
  },

  async update(scope: RequestScope, id: string, dto: UpdateRoleDto) {
    const existing = await rolesRepository.findById(id);
    if (!existing) throw new NotFoundError('Rol no encontrado');
    if (existing.isSystem && dto.name && dto.name !== existing.name) {
      throw new ValidationError('No se puede renombrar un rol del sistema');
    }
    if (dto.name && dto.name !== existing.name) {
      const dup = await rolesRepository.findByName(dto.name);
      if (dup && dup.id !== id) throw new ConflictError('Ya existe un rol con ese nombre');
    }
    const role = await rolesRepository.update(id, dto) as RoleWithPerms;
    // Diff de permisos del rol (concedidos = nuevos − previos; retirados = previos − nuevos).
    const beforeSet = new Set(existing.permissions.map((rp) => rp.permissionId));
    const afterSet = new Set(role.permissions.map((rp) => rp.permissionId));
    const lbl = (rp: { permission: { module: string; action: string } }) => `${rp.permission.module}/${rp.permission.action}`;
    const granted = role.permissions.filter((rp) => !beforeSet.has(rp.permissionId));
    const revoked = existing.permissions.filter((rp) => !afterSet.has(rp.permissionId));
    const nameChanged = !!dto.name && dto.name !== existing.name;
    if (granted.length || revoked.length || nameChanged) {
      const parts: string[] = [];
      if (granted.length) parts.push(`+${granted.length} permiso(s)`);
      if (revoked.length) parts.push(`−${revoked.length} permiso(s)`);
      if (nameChanged) parts.push(`renombrado ${existing.name} → ${role.name}`);
      void recordActivity(scope, {
        activity: revoked.length && !granted.length ? 'PERMISSION_REVOKE' : 'PERMISSION_GRANT', area: 'PERMISOS', entityId: role.id,
        reference: `Rol ${role.name}`,
        detail: `Rol ${role.name} · ${parts.join(' · ')}`,
        meta: { role: role.name, granted: granted.map(lbl), revoked: revoked.map(lbl), nameBefore: existing.name, nameAfter: role.name },
      });
    }
    return serialize(role);
  },

  async remove(id: string) {
    const existing = await rolesRepository.findById(id);
    if (!existing) throw new NotFoundError('Rol no encontrado');
    if (existing.isSystem) throw new ValidationError('No se puede eliminar un rol del sistema');
    const userCount = await rolesRepository.countUsers(id);
    if (userCount > 0) {
      throw new ValidationError('No se puede eliminar un rol con usuarios asignados');
    }
    return rolesRepository.delete(id);
  },

  listPermissions() {
    return rolesRepository.listPermissions();
  },
};
