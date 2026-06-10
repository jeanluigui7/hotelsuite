import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const guestsRepository = {
  list(args: {
    where: Prisma.GuestWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.GuestOrderByWithRelationInput;
  }) {
    return prisma.guest.findMany(args);
  },

  count(where: Prisma.GuestWhereInput) {
    return prisma.guest.count({ where });
  },

  findById(id: string) {
    return prisma.guest.findUnique({ where: { id } });
  },

  findByDocument(documentType: string, documentNumber: string) {
    return prisma.guest.findUnique({
      where: { documentType_documentNumber: { documentType, documentNumber } },
    });
  },

  create(data: Prisma.GuestUncheckedCreateInput) {
    return prisma.guest.create({ data });
  },

  update(id: string, data: Prisma.GuestUpdateInput) {
    return prisma.guest.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.guest.delete({ where: { id } });
  },
};
