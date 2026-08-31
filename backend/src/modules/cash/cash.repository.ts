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
    // Fotografía histórica: habitaciones disponibles (FREE) en el momento de abrir el turno.
    const roomsAvailableAtOpen = await prisma.room.count({ where: { branchId: data.branchId, status: 'FREE' } });
    return prisma.cashSession.create({ data: { ...data, number, roomsAvailableAtOpen } });
  },

  close(
    id: string,
    data: { closingAmount: number; expectedAmount: number; notes: string | null; closedByUserId: string; closingDenominations: string | null },
  ) {
    return prisma.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingAmount: data.closingAmount,
        expectedAmount: data.expectedAmount,
        closedByUserId: data.closedByUserId,
        closingDenominations: data.closingDenominations,
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
    method?: string | null;
    reference?: string | null;
    note?: string | null;
    category?: string | null;
    createdByUserId: string;
  }) {
    return prisma.cashMovement.create({ data });
  },

  findMovement(id: string) {
    return prisma.cashMovement.findUnique({ where: { id } });
  },
  updateMovement(id: string, data: { type?: string; amount?: number; concept?: string; method?: string | null; reference?: string | null; note?: string | null; category?: string | null }) {
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
    return prisma.cashMovement.findMany({ where: { cashSessionId, voided: false }, orderBy: { createdAt: 'asc' } });
  },

  /** Movimientos del turno con el nombre del usuario que los registró (para la vista de caja).
   *  Incluye los anulados (voided) para trazabilidad; la UI los muestra como ANULADO y quedan
   *  fuera de los totales. */
  async listMovementsDetailed(cashSessionId: string) {
    const movs = await prisma.cashMovement.findMany({ where: { cashSessionId }, orderBy: { createdAt: 'asc' } });
    const userIds = [
      ...new Set(
        movs.flatMap((m) => [m.createdByUserId, m.voidedByUserId]).filter((x): x is string => !!x),
      ),
    ];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const uMap = new Map(users.map((u) => [u.id, u.name]));
    return movs.map((m) => ({
      id: m.id,
      type: m.type as 'IN' | 'OUT',
      concept: m.concept,
      amount: Number(m.amount),
      method: m.method ?? 'CASH',
      reference: m.reference ?? null,
      note: m.note ?? null,
      category: m.category ?? 'MOVEMENT',
      createdAt: m.createdAt,
      user: m.createdByUserId ? (uMap.get(m.createdByUserId) ?? null) : null,
      voided: m.voided,
      voidedAt: m.voidedAt,
      voidReason: m.voidReason ?? null,
      voidedBy: m.voidedByUserId ? (uMap.get(m.voidedByUserId) ?? null) : null,
    }));
  },

  async movementsTotal(cashSessionId: string, type: string) {
    const result = await prisma.cashMovement.aggregate({
      where: { cashSessionId, type, voided: false },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  /** Total de INGRESOS que entran físicamente al cajón (solo efectivo; null = efectivo legado). */
  async movementsCashInTotal(cashSessionId: string) {
    const result = await prisma.cashMovement.aggregate({
      where: { cashSessionId, type: 'IN', voided: false, OR: [{ method: 'CASH' }, { method: null }] },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  /** Soft-anular un movimiento: se conserva el registro pero queda fuera de todos los totales. */
  voidMovement(id: string, voidedByUserId: string | null, voidReason: string | null) {
    return prisma.cashMovement.update({
      where: { id },
      data: { voided: true, voidedAt: new Date(), voidedByUserId, voidReason },
    });
  },

  /** Registra una intervención de auditoría sobre una caja. */
  createIntervention(data: {
    branchId: string;
    cashSessionId: string;
    type: string;
    targetKind: string;
    targetId?: string | null;
    beforeJson?: string | null;
    afterJson?: string | null;
    reason?: string | null;
    createdByUserId?: string | null;
  }) {
    return prisma.cashIntervention.create({ data });
  },

  listInterventions(cashSessionId: string) {
    return prisma.cashIntervention.findMany({ where: { cashSessionId }, orderBy: { createdAt: 'asc' } });
  },

  /** Marca una caja como AJUSTADA solo si estaba CERRADA (nunca toca cajas ABIERTAS). */
  async markAdjusted(cashSessionId: string) {
    const res = await prisma.cashSession.updateMany({
      where: { id: cashSessionId, status: 'CLOSED' },
      data: { status: 'AJUSTADA' },
    });
    return res.count > 0;
  },

  async getSetting(branchId: string, key: string) {
    const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
    return s?.value ?? null;
  },
  async upsertSetting(branchId: string, key: string, value: string) {
    await prisma.setting.upsert({
      where: { branchId_key: { branchId, key } },
      create: { branchId, key, value },
      update: { value },
    });
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

  /** Una venta con sus líneas y pagos (para el detalle VER de un movimiento). */
  saleById(id: string) {
    return prisma.sale.findUnique({ where: { id }, include: { items: true, payments: true } });
  },

  /** Intervenciones de auditoría que apuntan a un objeto (venta/movimiento). */
  interventionsForTarget(targetId: string) {
    return prisma.cashIntervention.findMany({ where: { targetId }, orderBy: { createdAt: 'asc' } });
  },

  /** Tipo de cada producto (PRODUCTO | SERVICIO | AMENITY | INSUMO) por id. */
  async productTypes(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, productType: true } });
    return new Map(rows.map((p) => [p.id, p.productType]));
  },

  /** Habitación, huésped y folio por estancia (para enriquecer la descripción del movimiento). */
  async stayInfo(ids: string[]) {
    if (ids.length === 0) return new Map<string, { room: string; guest: string; folioCode: string | null }>();
    const rows = await prisma.stay.findMany({
      where: { id: { in: ids } },
      select: { id: true, folioCode: true, room: { select: { number: true } }, guest: { select: { firstName: true, lastName: true } } },
    });
    return new Map(
      rows.map((s) => [
        s.id,
        { room: s.room?.number ?? '', guest: `${s.guest?.firstName ?? ''} ${s.guest?.lastName ?? ''}`.trim(), folioCode: s.folioCode ?? null },
      ]),
    );
  },

  /** Sale line items of a session (excluding cancelled sales) for the per-item breakdown. */
  saleItems(cashSessionId: string) {
    return prisma.saleItem.findMany({
      where: { sale: { cashSessionId, status: { not: 'CANCELLED' } } },
    });
  },

  /** Estancias con check-in dentro de la ventana del turno (para detectar cargos sin registrar). */
  staysInWindow(branchId: string, from: Date, to: Date) {
    return prisma.stay.findMany({
      where: { branchId, status: { not: 'CANCELLED' }, checkInAt: { gte: from, lte: to } },
      select: {
        id: true, priceAgreed: true, checkInAt: true, status: true, folioCode: true,
        room: { select: { number: true } },
        guest: { select: { firstName: true, lastName: true } },
      },
    });
  },

  /** Ids de estancias (de la lista) que YA tienen al menos una venta no anulada. */
  async stayIdsWithSales(stayIds: string[]): Promise<Set<string>> {
    if (stayIds.length === 0) return new Set();
    const rows = await prisma.sale.findMany({
      where: { stayId: { in: stayIds }, status: { not: 'CANCELLED' } },
      select: { stayId: true },
    });
    return new Set(rows.map((r) => r.stayId).filter((x): x is string => !!x));
  },
};
