import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const rolesRepository = {
  list(args: {
    where: Prisma.RoleWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.RoleOrderByWithRelationInput;
  }) {
    return prisma.role.findMany({
      ...args,
      include: { _count: { select: { permissions: true, users: true } } },
    });
  },

  count(where: Prisma.RoleWhereInput) {
    return prisma.role.count({ where });
  },

  findById(id: string) {
    return prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
  },

  findByName(name: string) {
    return prisma.role.findUnique({ where: { name } });
  },

  create(data: { name: string; description?: string; permissionIds: string[] }) {
    return prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: { permissions: { include: { permission: true } } },
    });
  },

  /** Updates fields and (optionally) replaces the whole permission set atomically. */
  async update(
    id: string,
    data: { name?: string; description?: string; permissionIds?: string[] },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { name: data.name, description: data.description },
      });
      if (data.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (data.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }
      }
      return tx.role.findUnique({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });
    });
  },

  delete(id: string) {
    return prisma.role.delete({ where: { id } });
  },

  countUsers(roleId: string) {
    return prisma.user.count({ where: { roleId } });
  },

  listPermissions() {
    return prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  },
};
