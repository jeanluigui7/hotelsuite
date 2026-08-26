import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { shiftLogsService } from '../shift-logs/shift-logs.service';
import { cashService } from '../cash/cash.service';

const DAYS_ES = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const SHIFT_ES: Record<string, string> = { MANANA: 'MAÑANA', TARDE: 'TARDE', NOCHE: 'NOCHE' };
// Defaults de turno de recepción (si no hay RoleShift configurado), según especificación.
const RECEP_DEFAULT: Record<string, { start: string; end: string }> = {
  MANANA: { start: '06:30', end: '14:30' },
  TARDE: { start: '14:30', end: '22:30' },
  NOCHE: { start: '22:30', end: '06:30' },
};
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Ventana del turno de RECEPCIÓN que contiene `at` (fuente: RoleShift; fallback: defaults del spec). */
async function recepcionWindow(branchId: string, at: Date): Promise<{ shift: string; start: Date; end: Date; label: string }> {
  const { shift, start } = await shiftLogsService.currentShiftWindow(branchId, 'RECEPCION', at);
  const cfg = await prisma.roleShift.findUnique({ where: { branchId_role_shift: { branchId, role: 'RECEPCION', shift } } });
  const def = RECEP_DEFAULT[shift] ?? RECEP_DEFAULT.MANANA;
  const startTime = cfg?.startTime ?? def.start;
  const endTime = cfg?.endTime ?? def.end;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  // Si el RoleShift define el inicio, re-anclamos `start` a ese horario del mismo día del turno.
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), sh, sm, 0, 0);
  let durMin = eh * 60 + em - (sh * 60 + sm);
  if (durMin <= 0) durMin += 24 * 60; // cruza medianoche (NOCHE)
  const end = new Date(s.getTime() + durMin * 60_000);
  return { shift, start: s, end, label: `${pad2(sh)}:${pad2(sm)} - ${pad2(eh)}:${pad2(em)}` };
}

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
  /**
   * Resumen de Limpieza para la Vista General (operativo del TURNO ACTUAL, no histórico):
   *  - realizadasTurno: limpiezas finalizadas desde el inicio del turno de limpieza activo
   *    (misma lógica de producción por turno del Reporte Turno; suma todos los trabajadores).
   *  - enEspera / enCurso / mantenimiento: ESTADOS actuales de las habitaciones.
   */
  async limpieza(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const { shift, start } = await shiftLogsService.currentShiftWindow(branchId, 'LIMPIEZA');
    const WAITING = ['CLEANING', 'LIMPIEZA_EN_ESPERA', 'LIMPIEZA_SOLICITADA', 'REQUIERE_REPASO'];
    const [realizadasTurno, enEspera, enCurso, mantenimiento, byStatus, byResult, roomsCleaning, pendingTasks, pendingInspections] = await Promise.all([
      // Producción del turno actual: tareas finalizadas (DONE/INSPECTED) desde el inicio del turno.
      prisma.housekeepingTask.count({ where: { branchId, status: { in: ['DONE', 'INSPECTED'] }, completedAt: { gte: start } } }),
      prisma.room.count({ where: { branchId, status: { in: WAITING } } }),
      prisma.room.count({ where: { branchId, status: 'LIMPIEZA_EN_CURSO' } }),
      prisma.room.count({ where: { branchId, status: 'MAINTENANCE' } }),
      // Compat: campos previos (otros consumidores).
      prisma.housekeepingTask.groupBy({ by: ['status'], where: { branchId }, _count: { _all: true } }),
      prisma.housekeepingTask.groupBy({ by: ['result'], where: { branchId }, _count: { _all: true } }),
      prisma.room.count({ where: { branchId, status: 'CLEANING' } }),
      prisma.housekeepingTask.count({ where: { branchId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      prisma.housekeepingTask.count({ where: { branchId, status: 'DONE', result: 'PENDING' } }),
    ]);
    return {
      turno: shift,
      shiftStart: start,
      realizadasTurno,
      enEspera,
      enCurso,
      mantenimiento,
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

    const paymentsByMethod: Record<string, number> = { CASH: 0, CARD: 0, TRANSFER: 0, YAPE: 0, PLIN: 0, WALLET: 0 };
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

  /**
   * Vista de turno navegable (histórica): un TURNO = una CAJA (CashSession). Devuelve el turno
   * (día/turno/usuario/intervalo de recepción), navegación prev/next, la caja/dinero (reusando
   * cashService.detail) con desglose por concepto, y los indicadores individuales de control interno.
   * NO calcula el cuadre (pendiente de definir); solo entrega indicadores correctos.
   */
  async turnoView(scope: RequestScope, sessionId?: string) {
    const branchId = requireActiveBranch(scope);
    const session = sessionId
      ? await prisma.cashSession.findFirst({ where: { id: sessionId, branchId } })
      : await prisma.cashSession.findFirst({ where: { branchId }, orderBy: { openedAt: 'desc' } });
    if (!session) return { hasSession: false as const };

    const win = await recepcionWindow(branchId, session.openedAt);
    const [prev, next, user, detail, alquileresTurno, limpiezasTurno, checkOutsTurno, disponiblesActual] = await Promise.all([
      prisma.cashSession.findFirst({ where: { branchId, openedAt: { lt: session.openedAt } }, orderBy: { openedAt: 'desc' }, select: { id: true } }),
      prisma.cashSession.findFirst({ where: { branchId, openedAt: { gt: session.openedAt } }, orderBy: { openedAt: 'asc' }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: session.openedByUserId }, select: { name: true, email: true } }),
      cashService.detail(scope, session.id),
      prisma.stay.count({ where: { branchId, checkInAt: { gte: win.start, lt: win.end } } }),
      prisma.housekeepingTask.count({ where: { branchId, status: { in: ['DONE', 'INSPECTED'] }, completedAt: { gte: win.start, lt: win.end } } }),
      prisma.stay.count({ where: { branchId, checkOutAt: { gte: win.start, lt: win.end } } }),
      prisma.room.count({ where: { branchId, status: 'FREE' } }),
    ]);

    const byMethod = detail.methodBar.byMethod;
    const totalIncome = round(Object.values(byMethod).reduce((a, b) => a + Number(b), 0));
    const byConcepto = {
      hospedaje: round(detail.cards.ventasHospedaje),
      productos: round(detail.cards.ventasProductos),
      serviciosPenalidades: round(detail.cards.serviciosOtros),
    };
    const expectedCash = round(toNum(session.openingAmount) + (byMethod['CASH'] ?? 0) + detail.methodBar.ingresos - detail.methodBar.egresos);

    return {
      hasSession: true as const,
      turno: {
        sessionId: session.id,
        cajaNumber: session.number,
        day: DAYS_ES[win.start.getDay()],
        shift: SHIFT_ES[win.shift] ?? win.shift,
        interval: win.label,
        start: win.start,
        end: win.end,
        user: user?.name ?? user?.email ?? '—',
        status: session.status,
        openedAt: session.openedAt,
      },
      nav: { prevSessionId: prev?.id ?? null, nextSessionId: next?.id ?? null, isCurrent: !next },
      caja: {
        paymentsByMethod: byMethod,
        totalIncome,
        byConcepto,
        conceptoTotal: round(byConcepto.hospedaje + byConcepto.productos + byConcepto.serviciosPenalidades),
        expectedCash,
        movements: { in: round(detail.methodBar.ingresos), out: round(detail.methodBar.egresos) },
        openingAmount: toNum(session.openingAmount),
      },
      control: {
        disponiblesInicio: session.roomsAvailableAtOpen,
        alquileresTurno,
        limpiezasTurno,
        checkOutsTurno,
        disponiblesActual,
      },
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
