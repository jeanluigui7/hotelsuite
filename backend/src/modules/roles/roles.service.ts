import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
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

  async update(id: string, dto: UpdateRoleDto) {
    const existing = await rolesRepository.findById(id);
    if (!existing) throw new NotFoundError('Rol no encontrado');
    if (existing.isSystem && dto.name && dto.name !== existing.name) {
      throw new ValidationError('No se puede renombrar un rol del sistema');
    }
    if (dto.name && dto.name !== existing.name) {
      const dup = await rolesRepository.findByName(dto.name);
      if (dup && dup.id !== id) throw new ConflictError('Ya existe un rol con ese nombre');
    }
    const role = await rolesRepository.update(id, dto);
    return serialize(role as RoleWithPerms);
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
