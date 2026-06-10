import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const userInclude = {
  role: { select: { id: true, name: true } },
  branches: { select: { branchId: true } },
} as const;

export const usersRepository = {
  list(args: {
    where: Prisma.UserWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.UserOrderByWithRelationInput;
  }) {
    return prisma.user.findMany({ ...args, include: userInclude });
  },

  count(where: Prisma.UserWhereInput) {
    return prisma.user.count({ where });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, include: userInclude });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    roleId: string;
    status: string;
    branchIds: string[];
  }) {
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        roleId: data.roleId,
        status: data.status,
        branches: { create: data.branchIds.map((branchId) => ({ branchId })) },
      },
      include: userInclude,
    });
  },

  /** Updates fields and (optionally) replaces branch assignments atomically. */
  async update(
    id: string,
    data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      roleId?: string;
      status?: string;
      branchIds?: string[];
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          roleId: data.roleId,
          status: data.status,
        },
      });
      if (data.branchIds) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        if (data.branchIds.length > 0) {
          await tx.userBranch.createMany({
            data: data.branchIds.map((branchId) => ({ userId: id, branchId })),
          });
        }
      }
      return tx.user.findUnique({ where: { id }, include: userInclude });
    });
  },

  delete(id: string) {
    return prisma.user.delete({ where: { id } });
  },
};
