import type { RequestScope } from '../../shared/context';
import { NotFoundError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

// ── Helpers de tiempo ──
const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** Día ISO: 1=Lunes … 7=Domingo. */
const isoDay = (d: Date): number => (d.getDay() === 0 ? 7 : d.getDay());
const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Duración del turno en minutos (soporta turnos que cruzan medianoche). */
const durationMin = (start: string, end: string): number => {
  const s = toMin(start);
  const e = toMin(end);
  return e > s ? e - s : 24 * 60 - s + e;
};

interface RoleShiftRow {
  role: string;
  shift: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  daysOfWeek: string;
  status: string;
}

/** Turno activo (por config) para un rol en un instante dado, o null. */
function activeShiftKey(shifts: RoleShiftRow[], at: Date): string | null {
  const nowMin = at.getHours() * 60 + at.getMinutes();
  const day = isoDay(at);
  for (const s of shifts) {
    if (s.status !== 'active') continue;
    const days = s.daysOfWeek ? s.daysOfWeek.split(',').map(Number) : [];
    const start = toMin(s.startTime);
    const end = toMin(s.endTime);
    const inRange = end > start ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
    if (!inRange) continue;
    // Para turnos nocturnos después de medianoche, el día laboral es el de inicio (ayer).
    const anchorDay = end > start || nowMin >= start ? day : (day === 1 ? 7 : day - 1);
    if (days.length === 0 || days.includes(anchorDay)) return s.shift;
  }
  return null;
}

async function buildSnapshot(branchId: string, role: string, windowStart: Date, cutAt: Date) {
  if (role === 'LIMPIEZA') {
    const [items, stocks, cleaningsDone, maintenances, laundry] = await Promise.all([
      prisma.linenItem.findMany({ where: { branchId, status: 'active' }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.linenStock.findMany({ where: { branchId, floor: { not: 'ALMACEN' } } }),
      prisma.housekeepingTask.count({ where: { branchId, status: { in: ['DONE', 'INSPECTED'] }, completedAt: { gte: windowStart, lte: cutAt } } }),
      prisma.maintenance.count({ where: { branchId, createdAt: { gte: windowStart, lte: cutAt } } }),
      prisma.linenMovement.aggregate({ where: { branchId, type: 'LAUNDRY', createdAt: { gte: windowStart, lte: cutAt } }, _sum: { quantity: true } }),
    ]);
    const floorNames = [...new Set(stocks.map((s) => s.floor))].sort();
    const key = (li: string, f: string) => `${li}|${f}`;
    const stockMap = new Map(stocks.map((s) => [key(s.linenItemId, s.floor), s]));
    const floors = floorNames.map((floor) => ({
      floor,
      rows: items.map((it) => {
        const s = stockMap.get(key(it.id, floor));
        return { name: it.name, type: it.type, color: it.color, rem: s?.rem ?? 0, sum: s?.sum ?? 0 };
      }),
    }));
    const totRem = floors.reduce((a, f) => a + f.rows.reduce((b, r) => b + r.rem, 0), 0);
    const totSum = floors.reduce((a, f) => a + f.rows.reduce((b, r) => b + r.sum, 0), 0);
    return { floors, totals: { rem: totRem, sum: totSum }, cleaningsDone, maintenances, laundryItems: Math.abs(laundry._sum.quantity ?? 0) };
  }

  // RECEPCION
  const wh = await prisma.warehouse.findFirst({ where: { branchId, type: 'RECEPTION' } });
  const [stocks, sales, requests] = await Promise.all([
    wh ? prisma.stock.findMany({ where: { warehouseId: wh.id } }) : Promise.resolve([]),
    prisma.sale.findMany({ where: { branchId, status: { not: 'CANCELLED' }, createdAt: { gte: windowStart, lte: cutAt } }, include: { payments: true } }),
    prisma.productRequest.count({ where: { branchId, createdAt: { gte: windowStart, lte: cutAt } } }),
  ]);
  const prodIds = stocks.map((s) => s.productId);
  const products = await prisma.product.findMany({ where: { id: { in: prodIds } }, select: { id: true, name: true } });
  const pname = new Map(products.map((p) => [p.id, p.name]));
  const stock = stocks
    .map((s) => ({ name: pname.get(s.productId) ?? s.productId, quantity: s.quantity }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const byMethod: Record<string, number> = { CASH: 0, CARD: 0, TRANSFER: 0, WALLET: 0 };
  let salesTotal = 0;
  for (const sale of sales) {
    for (const p of sale.payments) {
      byMethod[p.method] = Math.round((byMethod[p.method] + Number(p.amount)) * 100) / 100;
      salesTotal = Math.round((salesTotal + Number(p.amount)) * 100) / 100;
    }
  }
  return { stock, sales: { count: sales.length, total: salesTotal, byMethod }, requests };
}

export const shiftLogsService = {
  /** Turno activo (por config) para un rol en la sucursal. */
  async currentShift(branchId: string, role: string, at: Date = new Date()): Promise<string | null> {
    const shifts = await prisma.roleShift.findMany({ where: { branchId, role } });
    return activeShiftKey(shifts, at);
  },

  /**
   * Graba un corte de turno: calcula la ventana del turno, arma el snapshot y crea
   * el ShiftLog. Si ya existe para (sucursal, rol, turno, fecha) no lo duplica.
   */
  async recordCut(opts: { branchId: string; role: string; shift: string; cutAt?: Date; auto: boolean; userId?: string | null }) {
    const { branchId, role, shift, auto } = opts;
    const cutAt = opts.cutAt ?? new Date();
    const cfg = await prisma.roleShift.findUnique({ where: { branchId_role_shift: { branchId, role, shift } } });
    const dur = cfg ? durationMin(cfg.startTime, cfg.endTime) : 8 * 60;
    const windowStart = new Date(cutAt.getTime() - dur * 60_000);
    const businessDate = ymd(cutAt);

    const existing = await prisma.shiftLog.findUnique({ where: { branchId_role_shift_businessDate: { branchId, role, shift, businessDate } } });
    if (existing) return existing;

    const snapshot = await buildSnapshot(branchId, role, windowStart, cutAt);
    try {
      return await prisma.shiftLog.create({
        data: { branchId, role, shift, businessDate, closedAt: cutAt, closedByUserId: opts.userId ?? null, auto, snapshot: JSON.stringify(snapshot) },
      });
    } catch {
      // Carrera con otro corte (unique) — devuelve el existente.
      return prisma.shiftLog.findUnique({ where: { branchId_role_shift_businessDate: { branchId, role, shift, businessDate } } });
    }
  },

  /** Cierre manual: graba el corte del turno activo del rol. */
  async closeManual(scope: RequestScope, role: string) {
    const branchId = requireActiveBranch(scope);
    const shift = await this.currentShift(branchId, role);
    if (!shift) throw new NotFoundError('No hay un turno activo para este rol en este horario');
    return this.recordCut({ branchId, role, shift, auto: false, userId: scope.userId });
  },

  async list(scope: RequestScope, filters: { role?: string; from?: string; to?: string }) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.shiftLog.findMany({
      where: {
        branchId,
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.from || filters.to ? { businessDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
      },
      orderBy: { closedAt: 'desc' },
      take: 200,
    });
    const userIds = [...new Set(rows.map((r) => r.closedByUserId).filter((x): x is string => !!x))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const uname = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      shift: r.shift,
      businessDate: r.businessDate,
      closedAt: r.closedAt,
      auto: r.auto,
      closedByName: r.closedByUserId ? (uname.get(r.closedByUserId) ?? '—') : 'Automático',
    }));
  },

  async get(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const r = await prisma.shiftLog.findUnique({ where: { id } });
    if (!r || r.branchId !== branchId) throw new NotFoundError('Corte no encontrado');
    return { id: r.id, role: r.role, shift: r.shift, businessDate: r.businessDate, closedAt: r.closedAt, auto: r.auto, snapshot: JSON.parse(r.snapshot) };
  },
};
