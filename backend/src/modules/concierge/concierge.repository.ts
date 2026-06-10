import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = { room: { select: { id: true, number: true } } } satisfies Prisma.ConciergeRequestInclude;

export type ConciergeWithRelations = Prisma.ConciergeRequestGetPayload<{ include: typeof include }>;

export const conciergeRepository = {
  list(args: {
    where: Prisma.ConciergeRequestWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ConciergeRequestOrderByWithRelationInput;
  }) {
    return prisma.conciergeRequest.findMany({ ...args, include });
  },
  count(where: Prisma.ConciergeRequestWhereInput) {
    return prisma.conciergeRequest.count({ where });
  },
  findById(id: string) {
    return prisma.conciergeRequest.findUnique({ where: { id }, include });
  },
  create(data: Prisma.ConciergeRequestUncheckedCreateInput) {
    return prisma.conciergeRequest.create({ data, include });
  },
  update(id: string, data: Prisma.ConciergeRequestUncheckedUpdateInput) {
    return prisma.conciergeRequest.update({ where: { id }, data, include });
  },
  delete(id: string) {
    return prisma.conciergeRequest.delete({ where: { id } });
  },
};
