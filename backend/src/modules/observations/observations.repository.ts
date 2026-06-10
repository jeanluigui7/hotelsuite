import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = { room: { select: { id: true, number: true } } } satisfies Prisma.ObservationInclude;

export type ObservationWithRelations = Prisma.ObservationGetPayload<{ include: typeof include }>;

export const observationsRepository = {
  list(args: {
    where: Prisma.ObservationWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ObservationOrderByWithRelationInput;
  }) {
    return prisma.observation.findMany({ ...args, include });
  },
  count(where: Prisma.ObservationWhereInput) {
    return prisma.observation.count({ where });
  },
  findById(id: string) {
    return prisma.observation.findUnique({ where: { id }, include });
  },
  create(data: Prisma.ObservationUncheckedCreateInput) {
    return prisma.observation.create({ data, include });
  },
  update(id: string, data: Prisma.ObservationUncheckedUpdateInput) {
    return prisma.observation.update({ where: { id }, data, include });
  },
  delete(id: string) {
    return prisma.observation.delete({ where: { id } });
  },
};
