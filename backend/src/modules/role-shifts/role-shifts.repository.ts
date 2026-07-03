import { prisma } from '../../config/prisma';

export const roleShiftsRepository = {
  listByBranch(branchId: string) {
    return prisma.roleShift.findMany({ where: { branchId }, orderBy: [{ role: 'asc' }, { startTime: 'asc' }] });
  },

  upsert(
    branchId: string,
    data: {
      role: string;
      shift: string;
      startTime: string;
      endTime: string;
      toleranceMinutes: number;
      daysOfWeek: string;
      status: string;
    },
  ) {
    const { role, shift, ...rest } = data;
    return prisma.roleShift.upsert({
      where: { branchId_role_shift: { branchId, role, shift } },
      update: rest,
      create: { branchId, role, shift, ...rest },
    });
  },

  createMany(rows: { branchId: string; role: string; shift: string; startTime: string; endTime: string; toleranceMinutes: number; daysOfWeek: string; status: string }[]) {
    return prisma.roleShift.createMany({ data: rows });
  },
};
