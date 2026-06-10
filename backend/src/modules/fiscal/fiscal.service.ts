import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

export const fiscalService = {
  /** Panel Fiscal: aggregates of issued invoices and notes for the active branch. */
  async panel(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);

    const byType = await prisma.invoice.groupBy({
      by: ['type'],
      where: { branchId, status: 'ISSUED' },
      _count: { _all: true },
      _sum: { total: true, taxAmount: true, subtotal: true },
    });

    const [issuedCount, voidedCount] = await Promise.all([
      prisma.invoice.count({ where: { branchId, status: 'ISSUED' } }),
      prisma.invoice.count({ where: { branchId, status: 'VOIDED' } }),
    ]);

    const notesByType = await prisma.creditDebitNote.groupBy({
      by: ['type'],
      where: { branchId },
      _count: { _all: true },
      _sum: { total: true },
    });

    const totals = byType.reduce(
      (acc, t) => {
        acc.total += Number(t._sum.total ?? 0);
        acc.tax += Number(t._sum.taxAmount ?? 0);
        acc.base += Number(t._sum.subtotal ?? 0);
        return acc;
      },
      { total: 0, tax: 0, base: 0 },
    );

    return {
      byType: byType.map((t) => ({
        type: t.type,
        count: t._count._all,
        total: Number(t._sum.total ?? 0),
        tax: Number(t._sum.taxAmount ?? 0),
        base: Number(t._sum.subtotal ?? 0),
      })),
      notesByType: notesByType.map((n) => ({
        type: n.type,
        count: n._count._all,
        total: Number(n._sum.total ?? 0),
      })),
      issuedCount,
      voidedCount,
      totals: {
        total: Math.round(totals.total * 100) / 100,
        tax: Math.round(totals.tax * 100) / 100,
        base: Math.round(totals.base * 100) / 100,
      },
    };
  },
};
