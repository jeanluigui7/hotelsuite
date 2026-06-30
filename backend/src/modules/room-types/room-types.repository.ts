import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

const include = {
  attributes: { include: { attribute: true } },
  _count: { select: { rates: true } },
} satisfies Prisma.RoomTypeInclude;

export type RoomTypeWithRelations = Prisma.RoomTypeGetPayload<{ include: typeof include }>;

export const roomTypesRepository = {
  list(args: {
    where: Prisma.RoomTypeWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.RoomTypeOrderByWithRelationInput;
  }) {
    return prisma.roomType.findMany({ ...args, include });
  },

  count(where: Prisma.RoomTypeWhereInput) {
    return prisma.roomType.count({ where });
  },

  findById(id: string) {
    return prisma.roomType.findUnique({ where: { id }, include });
  },

  create(data: {
    branchId: string;
    name: string;
    description?: string | null;
    capacity: number;
    basePrice?: number | null;
    extraHourPrice?: number | null;
    status: string;
    attributeIds: string[];
  }) {
    return prisma.roomType.create({
      data: {
        branchId: data.branchId,
        name: data.name,
        description: data.description,
        capacity: data.capacity,
        basePrice: data.basePrice ?? null,
        extraHourPrice: data.extraHourPrice ?? null,
        status: data.status,
        attributes: { create: data.attributeIds.map((attributeId) => ({ attributeId })) },
      },
      include,
    });
  },

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      capacity?: number;
      basePrice?: number | null;
      extraHourPrice?: number | null;
      status?: string;
      attributeIds?: string[];
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.roomType.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          capacity: data.capacity,
          basePrice: data.basePrice,
          extraHourPrice: data.extraHourPrice,
          status: data.status,
        },
      });
      if (data.attributeIds) {
        await tx.roomTypeAttribute.deleteMany({ where: { roomTypeId: id } });
        if (data.attributeIds.length > 0) {
          await tx.roomTypeAttribute.createMany({
            data: data.attributeIds.map((attributeId) => ({ roomTypeId: id, attributeId })),
          });
        }
      }
      return tx.roomType.findUnique({ where: { id }, include });
    });
  },

  /** Rates/CustomRates use NoAction FKs, so remove children explicitly. */
  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.roomTypeAttribute.deleteMany({ where: { roomTypeId: id } });
      await tx.customRate.deleteMany({ where: { roomTypeId: id } });
      await tx.rate.deleteMany({ where: { roomTypeId: id } });
      return tx.roomType.delete({ where: { id } });
    });
  },
};
