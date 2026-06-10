import { prisma } from '../../config/prisma';

export const cashRepository = {
  findOpen(branchId: string) {
    return prisma.cashSession.findFirst({ where: { branchId, status: 'OPEN' } });
  },

  findById(id: string) {
    return prisma.cashSession.findUnique({ where: { id } });
  },

  open(data: { branchId: string; openedByUserId: string; openingAmount: number; notes: string | null }) {
    return prisma.cashSession.create({ data });
  },

  close(id: string, data: { closingAmount: number; expectedAmount: number; notes: string | null }) {
    return prisma.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingAmount: data.closingAmount,
        expectedAmount: data.expectedAmount,
        notes: data.notes ?? undefined,
      },
    });
  },

  /** Sum of payments for a session, optionally by method. */
  async paymentsTotal(cashSessionId: string, method?: string) {
    const result = await prisma.payment.aggregate({
      where: { cashSessionId, ...(method ? { method } : {}) },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  salesCount(cashSessionId: string) {
    return prisma.sale.count({ where: { cashSessionId } });
  },

  addMovement(data: {
    cashSessionId: string;
    branchId: string;
    type: string;
    amount: number;
    concept: string;
    createdByUserId: string;
  }) {
    return prisma.cashMovement.create({ data });
  },

  listMovements(cashSessionId: string) {
    return prisma.cashMovement.findMany({ where: { cashSessionId }, orderBy: { createdAt: 'asc' } });
  },

  async movementsTotal(cashSessionId: string, type: string) {
    const result = await prisma.cashMovement.aggregate({
      where: { cashSessionId, type },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  listSessions(args: { branchId: string; skip: number; take: number }) {
    return prisma.cashSession.findMany({
      where: { branchId: args.branchId },
      skip: args.skip,
      take: args.take,
      orderBy: { openedAt: 'desc' },
    });
  },

  countSessions(branchId: string) {
    return prisma.cashSession.count({ where: { branchId } });
  },

  /** Sale line items of a session (excluding cancelled sales) for the per-item breakdown. */
  saleItems(cashSessionId: string) {
    return prisma.saleItem.findMany({
      where: { sale: { cashSessionId, status: { not: 'CANCELLED' } } },
    });
  },
};
