import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { AuthUser } from '../../shared/context';
import { SUPER_ADMIN_ROLE } from '../../shared/rbac';

const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  branches: true,
} satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/** Maps a Prisma user (with role/permissions/branches) to the AuthUser context. */
export function toAuthUser(user: UserWithRelations): AuthUser {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    roleId: user.roleId,
    roleName: user.role.name,
    isSuperAdmin: user.role.name === SUPER_ADMIN_ROLE,
    permissions: user.role.permissions.map(
      (rp) => `${rp.permission.module}:${rp.permission.action}`,
    ),
    branchIds: user.branches.map((ub) => ub.branchId),
  };
}

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, include: userInclude });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id }, include: userInclude });
  },

  createRefreshToken(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
