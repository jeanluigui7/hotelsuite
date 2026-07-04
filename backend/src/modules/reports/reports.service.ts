import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const reportsService = {
  /** Reporte de Habitaciones: conteo por estado + ocupación. */
  async rooms(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const grouped = await prisma.room.groupBy({
      by: ['status'],
      where: { branchId },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = { FREE: 0, OCCUPIED: 0, CLEANING: 0, MAINTENANCE: 0 };
    for (const g of grouped) byStatus[g.status] = g._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const occupancy = total > 0 ? round((byStatus.OCCUPIED / total) * 100) : 0;
    return { byStatus, total, occupancy };
  },

  /** Reporte de Limpiezas: conteo por estado y resultado. */
  async housekeeping(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [byStatus, byResult] = await Promise.all([
      prisma.housekeepingTask.groupBy({ by: ['status'], where: { branchId }, _count: { _all: true } }),
      prisma.housekeepingTask.groupBy({ by: ['result'], where: { branchId }, _count: { _all: true } }),
    ]);
    return {
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
      byResult: byResult.map((g) => ({ result: g.result, count: g._count._all })),
    };
  },

  /** Ventas Detalladas: líneas de venta (no anuladas) en un rango. */
  async salesDetailed(scope: RequestScope, from?: Date, to?: Date) {
    const branchId = requireActiveBranch(scope);
    const items = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          status: { not: 'CANCELLED' },
          ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
      include: { sale: { select: { id: true, customerName: true, createdAt: true, status: true } } },
      orderBy: { sale: { createdAt: 'desc' } },
    });
    return {
      items: items.map((i) => ({
        saleId: i.saleId,
        date: i.sale.createdAt,
        customer: i.sale.customerName ?? 'Cliente',
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
    };
  },

  /**
   * Historial de movimientos (Productos/Servicios/Hospedaje/Penalidades) por turno.
   * Cada fila es una línea de venta no anulada, enriquecida con habitación, método,
   * colaborador y el turno de recepción al que pertenece (por la hora).
   */
  async movements(
    scope: RequestScope,
    filters: { from?: Date; to?: Date; concept?: string; method?: string; roomId?: string; collaboratorId?: string; search?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const shifts = await prisma.roleShift.findMany({ where: { branchId, role: 'RECEPCION' } });

    const rawItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          status: { not: 'CANCELLED' },
          ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
          ...(filters.collaboratorId ? { createdByUserId: filters.collaboratorId } : {}),
        },
        ...(filters.search ? { description: { contains: filters.search } } : {}),
      },
      include: { sale: { include: { payments: true } } },
      orderBy: { sale: { createdAt: 'desc' } },
    });

    const productIds = [...new Set(rawItems.map((i) => i.productId).filter((x): x is string => !!x))];
    const stayIds = [...new Set(rawItems.map((i) => i.sale.stayId).filter((x): x is string => !!x))];
    const userIds = [...new Set(rawItems.map((i) => i.sale.createdByUserId).filter((x): x is string => !!x))];
    const [products, stays, users] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, productType: true } }),
      prisma.stay.findMany({ where: { id: { in: stayIds } }, select: { id: true, roomId: true, room: { select: { number: true } } } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    ]);
    const ptype = new Map(products.map((p) => [p.id, p.productType]));
    const stayMap = new Map(stays.map((s) => [s.id, { roomId: s.roomId, room: s.room?.number ?? '' }]));
    const uname = new Map(users.map((u) => [u.id, u.name]));

    const rxRenewal = /renovaci|tiempo extra|extensi/i;
    const rxRoom = /^tarifa[:\s]|pernocta|hospedaje|servicio de hospedaje|early|d[ií]a hotelero/i;
    const rxPenalty = /penalidad|multa|mora|tardanza|da[ñn]o|rotura/i;
    const conceptOf = (desc: string, productId: string | null): string => {
      if (rxPenalty.test(desc)) return 'PENALIDADES';
      if (rxRenewal.test(desc) || (!productId && rxRoom.test(desc))) return 'HOSPEDAJE';
      if (productId) return ptype.get(productId) === 'SERVICIO' ? 'SERVICIOS' : 'PRODUCTOS';
      return 'SERVICIOS';
    };
    const methodOf = (payments: { method: string }[]): string => {
      const set = new Set(payments.map((p) => p.method));
      if (set.size === 0) return 'PENDIENTE';
      if (set.size === 1) return [...set][0];
      return 'MIXTO';
    };
    const toMin = (h: string): number => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
    const shiftFor = (at: Date): string => {
      const nowMin = at.getHours() * 60 + at.getMinutes();
      for (const s of shifts) {
        if (s.status !== 'active') continue;
        const start = toMin(s.startTime); const end = toMin(s.endTime);
        const inR = end > start ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
        if (inR) return s.shift;
      }
      return 'MANANA';
    };

    const all = rawItems.map((i) => {
      const stay = i.sale.stayId ? stayMap.get(i.sale.stayId) : undefined;
      return {
        id: i.id,
        date: i.sale.createdAt,
        description: i.description,
        roomNumber: stay?.room || null,
        roomId: stay?.roomId ?? null,
        type: 'SALIDA',
        quantity: i.quantity,
        amount: Number(i.subtotal),
        method: methodOf(i.sale.payments),
        concept: conceptOf(i.description, i.productId),
        collaborator: i.sale.createdByUserId ? uname.get(i.sale.createdByUserId) ?? '—' : '—',
        collaboratorId: i.sale.createdByUserId ?? null,
        shift: shiftFor(i.sale.createdAt),
      };
    });

    // Opciones para los filtros (a partir del rango consultado).
    const collabMap = new Map<string, string>();
    const roomMap = new Map<string, string>();
    for (const r of all) {
      if (r.collaboratorId) collabMap.set(r.collaboratorId, r.collaborator);
      if (r.roomId && r.roomNumber) roomMap.set(r.roomId, r.roomNumber);
    }

    const items = all
      .filter((r) => !filters.concept || filters.concept === 'ALL' || r.concept === filters.concept)
      .filter((r) => !filters.method || filters.method === 'ALL' || r.method === filters.method)
      .filter((r) => !filters.roomId || r.roomId === filters.roomId);

    return {
      items,
      collaborators: [...collabMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      rooms: [...roomMap].map(([id, number]) => ({ id, number })).sort((a, b) => a.number.localeCompare(b.number)),
    };
  },

  /** Simulador Límite de Productos: stock vs venta media diaria (últimos 30 días). */
  async productLimit(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const products = await prisma.product.findMany({ where: { branchId }, include: { stock: true } });
    const soldItems = await prisma.saleItem.findMany({
      where: { sale: { branchId, status: { not: 'CANCELLED' }, createdAt: { gte: since } }, productId: { not: null } },
      select: { productId: true, quantity: true },
    });
    const soldMap = new Map<string, number>();
    for (const it of soldItems) {
      if (!it.productId) continue;
      soldMap.set(it.productId, (soldMap.get(it.productId) ?? 0) + it.quantity);
    }
    return {
      items: products.map((p) => {
        const stock = p.stock.reduce((acc, s) => acc + s.quantity, 0);
        const sold30 = soldMap.get(p.id) ?? 0;
        const avgDaily = round(sold30 / 30);
        const daysOfCover = avgDaily > 0 ? Math.floor(stock / avgDaily) : null;
        return { id: p.id, name: p.name, stock, sold30, avgDaily, daysOfCover };
      }),
    };
  },

  /** Inspecciones de Limpieza: detalle por ítem de checklist en un rango. */
  async inspections(scope: RequestScope, from?: Date, to?: Date) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.taskInspection.findMany({
      where: {
        task: {
          branchId,
          ...(from || to ? { inspectedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
      include: { task: { select: { roomId: true, inspectedAt: true, inspectedByUserId: true, result: true } } },
      orderBy: { task: { inspectedAt: 'desc' } },
    });

    // Resolve checklist item names, room numbers and inspector names via maps.
    const checklistIds = [...new Set(rows.map((r) => r.checklistItemId))];
    const roomIds = [...new Set(rows.map((r) => r.task.roomId))];
    const userIds = [...new Set(rows.map((r) => r.task.inspectedByUserId).filter((x): x is string => !!x))];
    const [checklist, rooms, users] = await Promise.all([
      prisma.checklistItem.findMany({ where: { id: { in: checklistIds } }, select: { id: true, name: true } }),
      prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    ]);
    const checklistMap = new Map(checklist.map((c) => [c.id, c.name]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.number]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        date: r.task.inspectedAt,
        room: roomMap.get(r.task.roomId) ?? '—',
        checklistItem: checklistMap.get(r.checklistItemId) ?? '—',
        passed: r.passed,
        note: r.note,
        inspector: r.task.inspectedByUserId ? (userMap.get(r.task.inspectedByUserId) ?? '—') : '—',
      })),
    };
  },
};
