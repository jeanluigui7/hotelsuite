import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const laundryMachinesRepository = {
  list(args: {
    where: Prisma.LaundryMachineWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.LaundryMachineOrderByWithRelationInput;
  }) {
    return prisma.laundryMachine.findMany(args);
  },
  count(where: Prisma.LaundryMachineWhereInput) {
    return prisma.laundryMachine.count({ where });
  },
  findById(id: string) {
    return prisma.laundryMachine.findUnique({ where: { id } });
  },
  create(data: Prisma.LaundryMachineUncheckedCreateInput) {
    return prisma.laundryMachine.create({ data });
  },
  update(id: string, data: Prisma.LaundryMachineUpdateInput) {
    return prisma.laundryMachine.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.laundryMachine.delete({ where: { id } });
  },
};
