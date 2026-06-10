import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { applyStockTx, createMovementTx } from '../movements/movements.repository';

const include = { inspections: true } satisfies Prisma.HousekeepingTaskInclude;
export type TaskWithRelations = Prisma.HousekeepingTaskGetPayload<{ include: typeof include }>;

export const housekeepingRepository = {
  list(args: {
    where: Prisma.HousekeepingTaskWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.HousekeepingTaskOrderByWithRelationInput;
  }) {
    return prisma.housekeepingTask.findMany({ ...args, include });
  },
  count(where: Prisma.HousekeepingTaskWhereInput) {
    return prisma.housekeepingTask.count({ where });
  },
  findById(id: string) {
    return prisma.housekeepingTask.findUnique({ where: { id }, include });
  },
  create(data: Prisma.HousekeepingTaskUncheckedCreateInput) {
    return prisma.housekeepingTask.create({ data, include });
  },
  update(id: string, data: Prisma.HousekeepingTaskUncheckedUpdateInput) {
    return prisma.housekeepingTask.update({ where: { id }, data, include });
  },

  /** Marks the task DONE and registers amenity consumption as OUT movements. */
  complete(args: {
    id: string;
    branchId: string;
    roomNumber: string;
    consumption: { productId: string; warehouseId: string; quantity: number }[];
    userId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      for (const c of args.consumption) {
        await applyStockTx(tx, c.productId, c.warehouseId, -c.quantity);
        await createMovementTx(tx, {
          branchId: args.branchId,
          productId: c.productId,
          warehouseId: c.warehouseId,
          type: 'OUT',
          quantity: -c.quantity,
          reference: `Limpieza Hab. ${args.roomNumber}`,
          createdByUserId: args.userId,
        });
      }
      return tx.housekeepingTask.update({
        where: { id: args.id },
        data: { status: 'DONE', completedAt: new Date() },
        include,
      });
    });
  },

  /** Stores inspection results, sets result, and frees the room if approved. */
  inspect(args: {
    id: string;
    roomId: string;
    approved: boolean;
    items: { checklistItemId: string; passed: boolean; note: string | null }[];
    userId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.taskInspection.deleteMany({ where: { taskId: args.id } });
      if (args.items.length > 0) {
        await tx.taskInspection.createMany({
          data: args.items.map((i) => ({
            taskId: args.id,
            checklistItemId: i.checklistItemId,
            passed: i.passed,
            note: i.note,
          })),
        });
      }
      const task = await tx.housekeepingTask.update({
        where: { id: args.id },
        data: {
          status: 'INSPECTED',
          result: args.approved ? 'APPROVED' : 'REJECTED',
          inspectedAt: new Date(),
          inspectedByUserId: args.userId,
        },
        include,
      });
      if (args.approved) {
        await tx.room.update({ where: { id: args.roomId }, data: { status: 'FREE' } });
      }
      return task;
    });
  },
};
