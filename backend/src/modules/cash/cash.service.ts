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
};
