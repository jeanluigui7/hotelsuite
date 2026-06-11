import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

function toNum(n: unknown): number {
  return n == null ? 0 : Number(n);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Inicio y fin del día actual (hora del servidor). */
function todayRange(): { start: Date; end: Date; now: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end, now };
}

export const dashboardService = {
  /** Resumen de Recepción: ocupación, estancias y movimiento del día. */
  async recepcion(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const { start, end, now } = todayRange();

    const [grouped, activeStays, checkInsToday, checkOutsToday, pendingCheckouts, reservationsPending] =
      await Promise.all([
        prisma.room.groupBy({ by: ['status'], where: { branchId }, _count: { _all: true } }),
        prisma.stay.count({ where: { branchId, status: 'OPEN' } }),
        prisma.stay.count({ where: { branchId, checkInAt: { gte: start, lt: end } } }),
        prisma.stay.count({ where: { branchId, checkOutAt: { gte: start, lt: end } } }),
        prisma.stay.count({ where: { branchId, status: 'OPEN', plannedCheckoutAt: { lte: now } } }),
        prisma.reservation.count({
          where: { branchId, status: { in: ['PENDING', 'CONFIRMED'] }, expectedCheckInAt: { lt: end } },
        }),
      ]);

    const byStatus: Record<string, number> = { FREE: 0, OCCUPIED: 0, CLEANING: 0, MAINTENANCE: 0 };
    for (const g of grouped) byStatus[g.status] = g._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const occupancy = total > 0 ? round((byStatus.OCCUPIED / total) * 100) : 0;

    return {
      rooms: { byStatus, total, occupancy },
      activeStays,
      checkInsToday,
      checkOutsToday,
      pendingCheckouts,
      reservationsPending,
    };
  },

  /** Resumen de Limpieza: tareas por estado/resultado y pendientes. */
  async limpieza(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [byStatus, byResult, roomsCleaning, pendingTasks, pendingInspections] = await Promise.all([
      prisma.housekeepingTask.groupBy({ by: ['status'], where: { branchId }, _count: { _all: true } }),
      prisma.housekeepingTask.groupBy({ by: ['result'], where: { branchId }, _count: { _all: true } }),
      prisma.room.count({ where: { branchId, status: 'CLEANING' } }),
      prisma.housekeepingTask.count({ where: { branchId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      prisma.housekeepingTask.count({ where: { branchId, status: 'DONE', result: 'PENDING' } }),
    ]);
    return {
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
      byResult: byResult.map((g) => ({ result: g.result, count: g._count._all })),
      roomsCleaning,
      pendingTasks,
      pendingInspections,
    };
  },

  /** Resumen de Caja: estado del turno abierto e ingresos por método. */
  async caja(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return { open: false as const };

    const [payments, salesCount, movements] = await Promise.all([
      prisma.payment.groupBy({
        by: ['method'],
        where: { cashSessionId: session.id },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.sale.count({ where: { cashSessionId: session.id, status: { not: 'CANCELLED' } } }),
      prisma.cashMovement.groupBy({
        by: ['type'],
        where: { cashSessionId: session.id },
        _sum: { amount: true },
      }),
    ]);

    const paymentsByMethod: Record<string, number> = { CASH: 0, CARD: 0, TRANSFER: 0, WALLET: 0 };
    for (const p of payments) paymentsByMethod[p.method] = toNum(p._sum.amount);
    const totalIncome = Object.values(paymentsByMethod).reduce((a, b) => a + b, 0);
    const movIn = toNum(movements.find((m) => m.type === 'IN')?._sum.amount);
    const movOut = toNum(movements.find((m) => m.type === 'OUT')?._sum.amount);
    const expectedCash = round(toNum(session.openingAmount) + paymentsByMethod.CASH + movIn - movOut);

    return {
      open: true as const,
      session: { id: session.id, openedAt: session.openedAt, openingAmount: toNum(session.openingAmount) },
      paymentsByMethod,
      totalIncome: round(totalIncome),
      salesCount,
      movements: { in: round(movIn), out: round(movOut) },
      expectedCash,
    };
  },

  /** Control de Turno: detalle del turno abierto (quién, desde cuándo, conteos y esperado). */
  async turno(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findFirst({
      where: { branchId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return { open: false as const };

    const [salesCount, movementsCount, cashPayments, movements] = await Promise.all([
      prisma.sale.count({ where: { cashSessionId: session.id, status: { not: 'CANCELLED' } } }),
      prisma.cashMovement.count({ where: { cashSessionId: session.id } }),
      prisma.payment.aggregate({
        where: { cashSessionId: session.id, method: 'CASH' },
        _sum: { amount: true },
      }),
      prisma.cashMovement.groupBy({ by: ['type'], where: { cashSessionId: session.id }, _sum: { amount: true } }),
    ]);

    const cashIn = toNum(cashPayments._sum.amount);
    const movIn = toNum(movements.find((m) => m.type === 'IN')?._sum.amount);
    const movOut = toNum(movements.find((m) => m.type === 'OUT')?._sum.amount);
    const openedBy = await prisma.user.findUnique({
      where: { id: session.openedByUserId },
      select: { name: true, email: true },
    });

    return {
      open: true as const,
      session: {
        id: session.id,
        openedAt: session.openedAt,
        openingAmount: toNum(session.openingAmount),
        openedBy: openedBy?.name ?? openedBy?.email ?? '—',
      },
      salesCount,
      movementsCount,
      expectedAmount: round(toNum(session.openingAmount) + cashIn + movIn - movOut),
    };
  },
};
