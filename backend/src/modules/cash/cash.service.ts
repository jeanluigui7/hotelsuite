import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { cashRepository } from './cash.repository';
import { PAYMENT_METHODS } from '../../shared/payments';
import type { CloseCashDto, MovementDto, OpenCashDto } from './cash.schema';

async function sessionSummary(id: string, opening: number) {
  const byMethod: Record<string, number> = {};
  for (const m of PAYMENT_METHODS) {
    byMethod[m] = await cashRepository.paymentsTotal(id, m);
  }
  const totalCollected = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const cash = byMethod['CASH'] ?? 0;
  const movementsIn = await cashRepository.movementsTotal(id, 'IN');
  const movementsOut = await cashRepository.movementsTotal(id, 'OUT');
  const expectedCash = Math.round((opening + cash + movementsIn - movementsOut) * 100) / 100;
  const salesCount = await cashRepository.salesCount(id);
  return { byMethod, totalCollected, movementsIn, movementsOut, expectedCash, salesCount };
}

export const cashService = {
  async current(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const session = await cashRepository.findOpen(branchId);
    if (!session) return { session: null };
    const summary = await sessionSummary(session.id, Number(session.openingAmount));
    return { session, summary };
  },

  async open(scope: RequestScope, dto: OpenCashDto) {
    const branchId = requireActiveBranch(scope);
    const existing = await cashRepository.findOpen(branchId);
    if (existing) throw new ConflictError('Ya hay un turno de caja abierto en la sucursal');
    return cashRepository.open({
      branchId,
      openedByUserId: scope.userId,
      openingAmount: dto.openingAmount,
      notes: dto.notes || null,
    });
  },

  async close(scope: RequestScope, dto: CloseCashDto) {
    const branchId = requireActiveBranch(scope);
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new NotFoundError('No hay un turno abierto');
    const summary = await sessionSummary(session.id, Number(session.openingAmount));
    const closed = await cashRepository.close(session.id, {
      closingAmount: dto.closingAmount,
      expectedAmount: summary.expectedCash,
      notes: dto.notes || null,
      closedByUserId: scope.userId,
    });
    return {
      session: closed,
      summary,
      difference: Math.round((dto.closingAmount - summary.expectedCash) * 100) / 100,
    };
  },

  async addMovement(scope: RequestScope, dto: MovementDto) {
    const branchId = requireActiveBranch(scope);
    const session = await cashRepository.findOpen(branchId);
    if (!session) throw new ConflictError('Debe abrir un turno para registrar movimientos');
    return cashRepository.addMovement({
      cashSessionId: session.id,
      branchId,
      type: dto.type,
      amount: dto.amount,
      concept: dto.concept,
      createdByUserId: scope.userId,
    });
  },

  async listSessions(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      cashRepository.listSessions({ branchId, status, skip, take }),
      cashRepository.countSessions(branchId, status),
    ]);
    const names = await cashRepository.userNames([
      ...new Set(rows.flatMap((s) => [s.openedByUserId, s.closedByUserId].filter((x): x is string => !!x))),
    ]);
    const items = rows.map((s) => {
      const closing = s.closingAmount != null ? Number(s.closingAmount) : null;
      const expected = s.expectedAmount != null ? Number(s.expectedAmount) : null;
      return {
        id: s.id,
        number: s.number,
        status: s.status,
        openingAmount: Number(s.openingAmount),
        closingAmount: closing,
        expectedAmount: expected,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openedByName: names.get(s.openedByUserId) ?? '—',
        closedByName: s.closedByUserId ? (names.get(s.closedByUserId) ?? '—') : null,
        // Cuadre: efectivo contado − esperado (null si el turno sigue abierto).
        difference: closing != null && expected != null ? Math.round((closing - expected) * 100) / 100 : null,
      };
    });
    return { items, meta: pageMeta(params, total) };
  },

  /** Cuadro de turno: resumen completo de un turno. */
  async report(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const session = await cashRepository.findById(id);
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');

    const summary = await sessionSummary(id, Number(session.openingAmount));
    const movements = await cashRepository.listMovements(id);

    const items = await cashRepository.saleItems(id);
    const byItemMap = new Map<string, { description: string; quantity: number; total: number }>();
    for (const it of items) {
      const entry = byItemMap.get(it.description) ?? { description: it.description, quantity: 0, total: 0 };
      entry.quantity += it.quantity;
      entry.total = Math.round((entry.total + Number(it.subtotal)) * 100) / 100;
      byItemMap.set(it.description, entry);
    }

    return {
      session,
      summary,
      movements,
      byItem: [...byItemMap.values()].sort((a, b) => b.total - a.total),
      countedAmount: session.closingAmount,
      difference:
        session.closingAmount != null
          ? Math.round((Number(session.closingAmount) - summary.expectedCash) * 100) / 100
          : null,
    };
  },

  /**
   * Detalle completo de un turno para el modal de caja: tarjetas por categoría,
   * barra por método y la lista de movimientos tipados (Hospedaje / Renovación /
   * Producto / Servicio / Ingreso / Egreso).
   */
  async detail(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const session = await cashRepository.findById(id);
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');

    const [sales, movements] = await Promise.all([
      cashRepository.sessionSales(id),
      cashRepository.listMovements(id),
    ]);

    const productIds = [...new Set(sales.flatMap((s) => s.items.map((i) => i.productId).filter((x): x is string => !!x)))];
    const stayIds = [...new Set(sales.map((s) => s.stayId).filter((x): x is string => !!x))];
    const [productTypes, stayInfo, names] = await Promise.all([
      cashRepository.productTypes(productIds),
      cashRepository.stayInfo(stayIds),
      cashRepository.userNames([session.openedByUserId, session.closedByUserId].filter((x): x is string => !!x)),
    ]);

    const round = (n: number) => Math.round(n * 100) / 100;
    const rxRenewal = /renovaci|tiempo extra|extensi/i;
    const rxRoom = /^tarifa[:\s]|pernocta|hospedaje|servicio de hospedaje|early|d[ií]a hotelero/i;
    const itemType = (desc: string, productId: string | null): 'HOSPEDAJE' | 'RENOVACION' | 'PRODUCTO' | 'SERVICIO' => {
      if (rxRenewal.test(desc)) return 'RENOVACION';
      if (!productId && rxRoom.test(desc)) return 'HOSPEDAJE';
      if (productId) return productTypes.get(productId) === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO';
      return 'SERVICIO';
    };

    // Método a nivel de venta: único → ese; varios → MIXTO; sin pago → PENDIENTE.
    const saleMethod = (payments: { method: string }[]): string => {
      const set = new Set(payments.map((p) => p.method));
      if (set.size === 0) return 'PENDIENTE';
      if (set.size === 1) return [...set][0];
      return 'MIXTO';
    };

    const cards = { ventasHospedaje: 0, ventasProductos: 0, serviciosOtros: 0, deudasPendientes: 0, efectivo: 0, ajustes: 0 };
    let anulaciones = 0;
    const feed: {
      id: string; saleId: string | null; time: Date; type: string; description: string;
      amount: number; method: string; status: 'NORMAL' | 'ANULADO';
    }[] = [];

    for (const sale of sales) {
      const cancelled = sale.status === 'CANCELLED';
      const method = saleMethod(sale.payments);
      const info = sale.stayId ? stayInfo.get(sale.stayId) : undefined;
      const suffix = info?.room ? ` - Hab. ${info.room}` : '';
      if (cancelled) anulaciones = round(anulaciones + Number(sale.total));
      const paid = sale.payments.reduce((a, p) => a + Number(p.amount), 0);
      if (!cancelled) cards.deudasPendientes = round(cards.deudasPendientes + Math.max(0, Number(sale.total) - paid));

      for (const it of sale.items) {
        const t = itemType(it.description, it.productId);
        const amount = Number(it.subtotal);
        if (!cancelled) {
          if (t === 'HOSPEDAJE' || t === 'RENOVACION') cards.ventasHospedaje = round(cards.ventasHospedaje + amount);
          else if (t === 'PRODUCTO') cards.ventasProductos = round(cards.ventasProductos + amount);
          else cards.serviciosOtros = round(cards.serviciosOtros + amount);
        }
        feed.push({
          id: it.id,
          saleId: sale.id,
          time: sale.createdAt,
          type: t,
          description: (it.description + suffix).trim(),
          amount,
          method,
          status: cancelled ? 'ANULADO' : 'NORMAL',
        });
      }
    }

    let movIn = 0;
    let movOut = 0;
    for (const m of movements) {
      const amount = Number(m.amount);
      if (m.type === 'IN') movIn = round(movIn + amount);
      else movOut = round(movOut + amount);
      feed.push({
        id: m.id,
        saleId: null,
        time: m.createdAt,
        type: m.type === 'IN' ? 'INGRESO' : 'EGRESO',
        description: m.concept,
        amount,
        method: 'CASH',
        status: 'NORMAL',
      });
    }

    cards.ajustes = round(movIn - movOut);
    feed.sort((a, b) => b.time.getTime() - a.time.getTime());

    const byMethod: Record<string, number> = {};
    for (const m of PAYMENT_METHODS) byMethod[m] = await cashRepository.paymentsTotal(id, m);
    cards.efectivo = byMethod['CASH'] ?? 0;
    const total = round(Object.values(byMethod).reduce((a, b) => a + b, 0));

    return {
      session: {
        id: session.id,
        number: session.number,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        openedByName: names.get(session.openedByUserId) ?? '—',
        closedByName: session.closedByUserId ? (names.get(session.closedByUserId) ?? '—') : null,
        openingAmount: Number(session.openingAmount),
        closingAmount: session.closingAmount != null ? Number(session.closingAmount) : null,
      },
      cards,
      methodBar: { byMethod, ingresos: movIn, egresos: movOut, anulaciones, total },
      movements: feed,
    };
  },
};
