import { prisma } from '../../config/prisma';

export const cashRepository = {
  findOpen(branchId: string) {
    return prisma.cashSession.findFirst({ where: { branchId, status: 'OPEN' } });
  },

  findById(id: string) {
    return prisma.cashSession.findUnique({ where: { id } });
  },

  async open(data: { branchId: string; openedByUserId: string; openingAmount: number; notes: string | null }) {
    // Correlativo visible por sucursal: siguiente al mayor existente.
    const last = await prisma.cashSession.aggregate({
      where: { branchId: data.branchId },
      _max: { number: true },
    });
    const number = (last._max.number ?? 0) + 1;
    return prisma.cashSession.create({ data: { ...data, number } });
  },

  close(
    id: string,
    data: { closingAmount: number; expectedAmount: number; notes: string | null; closedByUserId: string },
  ) {
    return prisma.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingAmount: data.closingAmount,
        expectedAmount: data.expectedAmount,
        closedByUserId: data.closedByUserId,
        notes: data.notes ?? undefined,
      },
    });
  },

  /** Sum of payments for a session, optionally by method. Excluye ventas anuladas. */
  async paymentsTotal(cashSessionId: string, method?: string) {
    const result = await prisma.payment.aggregate({
      where: { cashSessionId, ...(method ? { method } : {}), sale: { status: { not: 'CANCELLED' } } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  /** Ventas del turno, sin contar las anuladas (que ya no aportan efectivo). */
  salesCount(cashSessionId: string) {
    return prisma.sale.count({ where: { cashSessionId, status: { not: 'CANCELLED' } } });
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

  findMovement(id: string) {
    return prisma.cashMovement.findUnique({ where: { id } });
  },
  updateMovement(id: string, data: { type?: string; amount?: number; concept?: string }) {
    return prisma.cashMovement.update({ where: { id }, data });
  },
  deleteMovement(id: string) {
    return prisma.cashMovement.delete({ where: { id } });
  },

  /** Reabre un turno cerrado: vuelve a OPEN y limpia los datos de cierre. */
  reopen(id: string) {
    return prisma.cashSession.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null, closingAmount: null, expectedAmount: null, closedByUserId: null },
    });
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

  listSessions(args: { branchId: string; status?: string; skip: number; take: number }) {
    return prisma.cashSession.findMany({
      where: { branchId: args.branchId, ...(args.status ? { status: args.status } : {}) },
      skip: args.skip,
      take: args.take,
      orderBy: { openedAt: 'desc' },
    });
  },

  countSessions(branchId: string, status?: string) {
    return prisma.cashSession.count({ where: { branchId, ...(status ? { status } : {}) } });
  },

  /** Nombres de usuario por id (para apertura/cierre del turno). */
  async userNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  },

  /** Ventas del turno con sus líneas y pagos (para el detalle de caja). */
  sessionSales(cashSessionId: string) {
    return prisma.sale.findMany({
      where: { cashSessionId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Tipo de cada producto (PRODUCTO | SERVICIO | AMENITY | INSUMO) por id. */
  async productTypes(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, productType: true } });
    return new Map(rows.map((p) => [p.id, p.productType]));
  },

  /** Habitación y huésped por estancia (para enriquecer la descripción del movimiento). */
  async stayInfo(ids: string[]) {
    if (ids.length === 0) return new Map<string, { room: string; guest: string }>();
    const rows = await prisma.stay.findMany({
      where: { id: { in: ids } },
      select: { id: true, room: { select: { number: true } }, guest: { select: { firstName: true, lastName: true } } },
    });
    return new Map(
      rows.map((s) => [
        s.id,
        { room: s.room?.number ?? '', guest: `${s.guest?.firstName ?? ''} ${s.guest?.lastName ?? ''}`.trim() },
      ]),
    );
  },

  /** Sale line items of a session (excluding cancelled sales) for the per-item breakdown. */
  saleItems(cashSessionId: string) {
    return prisma.saleItem.findMany({
      where: { sale: { cashSessionId, status: { not: 'CANCELLED' } } },
    });
  },
};
