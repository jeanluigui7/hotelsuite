import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const wifiRepository = {
  list(args: {
    where: Prisma.WifiCredentialWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.WifiCredentialOrderByWithRelationInput;
  }) {
    return prisma.wifiCredential.findMany(args);
  },
  count(where: Prisma.WifiCredentialWhereInput) {
    return prisma.wifiCredential.count({ where });
  },
  findById(id: string) {
    return prisma.wifiCredential.findUnique({ where: { id } });
  },
  create(data: Prisma.WifiCredentialUncheckedCreateInput) {
    return prisma.wifiCredential.create({ data });
  },
  update(id: string, data: Prisma.WifiCredentialUpdateInput) {
    return prisma.wifiCredential.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.wifiCredential.delete({ where: { id } });
  },
};
