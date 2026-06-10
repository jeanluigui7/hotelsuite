import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const attendanceRepository = {
  list(args: {
    where: Prisma.AttendanceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.AttendanceOrderByWithRelationInput;
  }) {
    return prisma.attendance.findMany(args);
  },
  count(where: Prisma.AttendanceWhereInput) {
    return prisma.attendance.count({ where });
  },
  create(data: Prisma.AttendanceUncheckedCreateInput) {
    return prisma.attendance.create({ data });
  },
};

/** Shared helper used by both manual entry and the biometric bridge (8B). */
export function recordAttendance(data: {
  branchId: string;
  userId: string;
  type: string;
  source: string;
  at?: Date;
  note?: string | null;
  deviceId?: string | null;
}) {
  return prisma.attendance.create({
    data: {
      branchId: data.branchId,
      userId: data.userId,
      type: data.type,
      source: data.source,
      at: data.at ?? new Date(),
      note: data.note ?? null,
      deviceId: data.deviceId ?? null,
    },
  });
}
