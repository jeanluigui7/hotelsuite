import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

export const performanceService = {
  /** Rendimiento del Personal: métricas por usuario de la sucursal activa. */
  async report(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);

    const users = await prisma.user.findMany({
      where: { branches: { some: { branchId } } },
      select: { id: true, name: true, role: { select: { name: true } } },
    });

    const [cleaning, sales, attendance] = await Promise.all([
      prisma.housekeepingTask.groupBy({
        by: ['assignedToUserId'],
        where: { branchId, status: { in: ['DONE', 'INSPECTED'] } },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ['createdByUserId'],
        where: { branchId, status: { not: 'CANCELLED' } },
        _count: { _all: true },
      }),
      prisma.attendance.groupBy({
        by: ['userId'],
        where: { branchId },
        _count: { _all: true },
      }),
    ]);

    const cleaningMap = new Map(cleaning.map((c) => [c.assignedToUserId, c._count._all]));
    const salesMap = new Map(sales.map((s) => [s.createdByUserId, s._count._all]));
    const attendanceMap = new Map(attendance.map((a) => [a.userId, a._count._all]));

    return {
      items: users.map((u) => ({
        userId: u.id,
        name: u.name,
        role: u.role.name,
        cleaningDone: cleaningMap.get(u.id) ?? 0,
        salesCount: salesMap.get(u.id) ?? 0,
        attendanceCount: attendanceMap.get(u.id) ?? 0,
      })),
    };
  },
};
