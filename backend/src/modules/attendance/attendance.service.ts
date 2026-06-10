import type { Attendance, Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { attendanceRepository, recordAttendance } from './attendance.repository';
import type { CreateAttendanceDto } from './attendance.schema';

async function userMap(branchId: string) {
  const users = await prisma.user.findMany({
    where: { branches: { some: { branchId } } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

function serialize(a: Attendance, users: Map<string, string>) {
  return {
    id: a.id,
    userId: a.userId,
    userName: users.get(a.userId) ?? '—',
    type: a.type,
    source: a.source,
    at: a.at,
    note: a.note,
  };
}

export const attendanceService = {
  async list(scope: RequestScope, params: PaginationParams, userId?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.AttendanceWhereInput = { branchId };
    if (userId) where.userId = userId;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      attendanceRepository.list({ where, skip, take, orderBy: { at: 'desc' } }),
      attendanceRepository.count(where),
    ]);
    const users = await userMap(branchId);
    return { items: rows.map((a) => serialize(a, users)), meta: pageMeta(params, total) };
  },

  async create(scope: RequestScope, dto: CreateAttendanceDto) {
    const branchId = requireActiveBranch(scope);
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      include: { branches: true },
    });
    if (!user || !user.branches.some((b) => b.branchId === branchId)) {
      throw new ValidationError('El usuario no pertenece a la sucursal');
    }
    const a = await recordAttendance({
      branchId,
      userId: dto.userId,
      type: dto.type,
      source: 'MANUAL',
      at: dto.at,
      note: dto.note || null,
    });
    return serialize(a, await userMap(branchId));
  },
};
