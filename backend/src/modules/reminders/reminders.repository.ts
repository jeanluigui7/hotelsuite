import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const remindersRepository = {
  list(branchId: string) {
    return prisma.reminder.findMany({ where: { branchId }, orderBy: { name: 'asc' } });
  },
  findById(id: string) {
    return prisma.reminder.findUnique({ where: { id } });
  },
  create(data: Prisma.ReminderUncheckedCreateInput) {
    return prisma.reminder.create({ data });
  },
  update(id: string, data: Prisma.ReminderUncheckedUpdateInput) {
    return prisma.reminder.update({ where: { id }, data });
  },
  delete(id: string) {
    return prisma.reminder.delete({ where: { id } });
  },
};
