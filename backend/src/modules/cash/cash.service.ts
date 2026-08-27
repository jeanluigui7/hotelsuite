import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { cashRepository } from './cash.repository';
import { PAYMENT_METHODS } from '../../shared/payments';
import type { CloseCashDto, MovementDto, OpenCashDto } from './cash.schema';

const FREQUENT_CONCEPTS_KEY = 'cashFrequentConcepts';

/** Snapshot serializable de un movimiento para la huella de auditoría (valor anterior/nuevo). */
function snapshotMovement(m: {
  type: string; amount: unknown; concept: string; method?: string | null; reference?: string | null; note?: string | null; category?: string | null;
}) {
  return {
    type: m.type,
    amount: Number(m.amount),
    concept: m.concept,
    method: m.method ?? null,
    reference: m.reference ?? null,
    note: m.note ?? null,
    category: m.category ?? null,
  };
}

/** Parsea el JSON de denominaciones del cierre; null si no hay o es inválido. */
function parseDenoms(raw: string | null): { value: number; qty: number }[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr
      .map((d) => ({ value: Number((d as { value: unknown }).value), qty: Number((d as { qty: unknown }).qty) }))
      .filter((d) => Number.isFinite(d.value) && Number.isFinite(d.qty));
  } catch {
    return null;
  }
}

async function sessionSummary(id: string, opening: number) {
  const byMethod: Record<string, number> = {};
  for (const m of PAYMENT_METHODS) {
    byMethod[m] = await cashRepository.paymentsTotal(id, m);
  }
  const totalCollected = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const cash = byMethod['CASH'] ?? 0;
  const movementsIn = await cashRepository.movementsTotal(id, 'IN');
  const movementsOut = await cashRepository.movementsTotal(id, 'OUT');
  // Solo el efectivo (ingresos CASH y todos los egresos) afecta el conteo físico del cajón.
  const movementsCashIn = await cashRepository.movementsCashInTotal(id);
  const expectedCash = Math.round((opening + cash + movementsCashIn - movementsOut) * 100) / 100;
  const salesCount = await cashRepository.salesCount(id);
  return { byMethod, totalCollected, movementsIn, movementsOut, expectedCash, salesCount };
}

export const cashService = {
  async current(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const session = await cashRepository.findOpen(branchId);
    if (!session) return { session: null };
    const summary = await sessionSummary(session.id, Number(session.openingAmount));
    const movements = await cashRepository.listMovementsDetailed(session.id);
    return { session, summary, movements };
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
      closingDenominations: dto.denominations && dto.denominations.length ? JSON.stringify(dto.denominations) : null,
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
    // Los egresos siempre salen del efectivo del cajón; el método solo aplica a ingresos.
    const method = dto.type === 'OUT' ? 'CASH' : (dto.method ?? 'CASH');
    return cashRepository.addMovement({
      cashSessionId: session.id,
      branchId,
      type: dto.type,
      amount: dto.amount,
      concept: dto.concept,
      method,
      reference: dto.reference?.trim() || null,
      note: dto.note?.trim() || null,
      category: dto.category ?? 'MOVEMENT',
      createdByUserId: scope.userId,
    });
  },

  /** Conceptos frecuentes de movimientos de caja (por sucursal). */
  async frequentConcepts(scope: RequestScope): Promise<string[]> {
    const branchId = requireActiveBranch(scope);
    const raw = await cashRepository.getSetting(branchId, FREQUENT_CONCEPTS_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  },
  async saveFrequentConcepts(scope: RequestScope, concepts: string[]): Promise<string[]> {
    const branchId = requireActiveBranch(scope);
    const clean = [...new Set(concepts.map((c) => c.trim()).filter(Boolean))].slice(0, 50);
    await cashRepository.upsertSetting(branchId, FREQUENT_CONCEPTS_KEY, JSON.stringify(clean));
    return clean;
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

  /** Detalle VER de un movimiento del feed: se adapta a venta o a movimiento de caja. Incluye historial. */
  async movementDetail(scope: RequestScope, params: { saleId?: string; movementId?: string }) {
    const branchId = requireActiveBranch(scope);
    const round = (n: number) => Math.round(n * 100) / 100;

    if (params.saleId) {
      const sale = await cashRepository.saleById(params.saleId);
      if (!sale || sale.branchId !== branchId) throw new NotFoundError('Venta no encontrada');
      const stayMap = sale.stayId ? await cashRepository.stayInfo([sale.stayId]) : new Map();
      const info = sale.stayId ? stayMap.get(sale.stayId) : undefined;
      const names = await cashRepository.userNames([sale.createdByUserId].filter((x): x is string => !!x));
      const session = sale.cashSessionId ? await cashRepository.findById(sale.cashSessionId) : null;
      const history = await this.buildHistory(sale.id);
      return {
        kind: 'SALE' as const,
        id: sale.id,
        time: sale.createdAt,
        status: sale.status,
        total: Number(sale.total),
        unregistered: sale.unregistered,
        verifyStatus: sale.verifyStatus,
        room: info?.room || null,
        guest: info?.guest || sale.customerName || null,
        folio: info?.folioCode || null,
        user: sale.createdByUserId ? (names.get(sale.createdByUserId) ?? null) : null,
        sessionId: sale.cashSessionId,
        sessionNumber: session?.number ?? null,
        items: sale.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: Number(it.unitPrice), subtotal: Number(it.subtotal) })),
        payments: sale.payments.map((p) => ({ method: p.method, amount: Number(p.amount), code: p.reference ?? null, time: p.createdAt })),
        history,
      };
    }

    if (params.movementId) {
      const m = await cashRepository.findMovement(params.movementId);
      if (!m || m.branchId !== branchId) throw new NotFoundError('Movimiento no encontrado');
      const names = await cashRepository.userNames([m.createdByUserId, m.voidedByUserId].filter((x): x is string => !!x));
      const session = await cashRepository.findById(m.cashSessionId);
      const history = await this.buildHistory(m.id);
      return {
        kind: 'MOVEMENT' as const,
        id: m.id,
        time: m.createdAt,
        type: m.type,
        concept: m.concept,
        amount: round(Number(m.amount)),
        method: m.method ?? 'CASH',
        reference: m.reference ?? null,
        note: m.note ?? null,
        category: m.category ?? 'MOVEMENT',
        status: m.voided ? 'ANULADO' : 'NORMAL',
        voidReason: m.voidReason ?? null,
        voidedBy: m.voidedByUserId ? (names.get(m.voidedByUserId) ?? null) : null,
        voidedAt: m.voidedAt,
        user: m.createdByUserId ? (names.get(m.createdByUserId) ?? null) : null,
        sessionId: m.cashSessionId,
        sessionNumber: session?.number ?? null,
        history,
      };
    }

    throw new NotFoundError('Indique la venta o el movimiento a consultar');
  },

  /** Historial de intervenciones (correcciones/anulaciones) que apuntan a un objeto. */
  async buildHistory(targetId: string) {
    const rows = await cashRepository.interventionsForTarget(targetId);
    const ids = [...new Set(rows.map((r) => r.createdByUserId).filter((x): x is string => !!x))];
    const names = ids.length ? await cashRepository.userNames(ids) : new Map<string, string>();
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      before: r.beforeJson ? (JSON.parse(r.beforeJson) as unknown) : null,
      after: r.afterJson ? (JSON.parse(r.afterJson) as unknown) : null,
      reason: r.reason,
      createdAt: r.createdAt,
      user: r.createdByUserId ? (names.get(r.createdByUserId) ?? null) : null,
    }));
  },

  /** Reabre un turno cerrado. Solo Admin/Superadmin; no puede haber otro turno abierto en la sucursal. */
  async reopen(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    if (!(scope.isSuperAdmin || scope.permissions.includes('settings:edit'))) {
      throw new ConflictError('Solo un administrador puede reabrir una caja.');
    }
    const session = await cashRepository.findById(id);
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');
    if (session.status === 'OPEN') throw new ConflictError('El turno ya está abierto');
    const open = await cashRepository.findOpen(branchId);
    if (open) throw new ConflictError('Ya hay un turno abierto; ciérrelo antes de reabrir otro');
    // Conserva la trazabilidad del cierre original antes de reabrir.
    await cashRepository.createIntervention({
      branchId,
      cashSessionId: id,
      type: 'REOPEN',
      targetKind: 'SESSION',
      targetId: id,
      beforeJson: JSON.stringify({
        status: session.status,
        closedAt: session.closedAt,
        closingAmount: session.closingAmount != null ? Number(session.closingAmount) : null,
        expectedAmount: session.expectedAmount != null ? Number(session.expectedAmount) : null,
        closedByUserId: session.closedByUserId ?? null,
      }),
      afterJson: JSON.stringify({ status: 'OPEN' }),
      reason: null,
      createdByUserId: scope.userId,
    });
    return cashRepository.reopen(id);
  },

  /** Edita un movimiento de caja (corrección: monto/concepto/tipo/método/comprobante/observación).
   *  Deja huella de auditoría (valor anterior → nuevo) y, si la caja ya estaba cerrada, la marca AJUSTADA. */
  async updateMovement(scope: RequestScope, id: string, dto: { type?: string; amount?: number; concept?: string; method?: string; reference?: string; note?: string; category?: string; reason?: string }) {
    const branchId = requireActiveBranch(scope);
    const mov = await cashRepository.findMovement(id);
    if (!mov || mov.branchId !== branchId) throw new NotFoundError('Movimiento no encontrado');
    if (mov.voided) throw new ConflictError('El movimiento está anulado; no puede corregirse');
    const before = snapshotMovement(mov);
    const data: { type?: string; amount?: number; concept?: string; method?: string; reference?: string | null; note?: string | null; category?: string } = {
      type: dto.type, amount: dto.amount, concept: dto.concept, category: dto.category,
    };
    // Si pasa a egreso, el método vuelve a efectivo (el método solo aplica a ingresos).
    if (dto.type === 'OUT') data.method = 'CASH';
    else if (dto.method !== undefined) data.method = dto.method;
    if (dto.reference !== undefined) data.reference = dto.reference.trim() || null;
    if (dto.note !== undefined) data.note = dto.note.trim() || null;
    const updated = await cashRepository.updateMovement(id, data);
    await cashRepository.createIntervention({
      branchId,
      cashSessionId: mov.cashSessionId,
      type: 'CORRECTION',
      targetKind: 'MOVEMENT',
      targetId: id,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(snapshotMovement(updated)),
      reason: dto.reason?.trim() || null,
      createdByUserId: scope.userId,
    });
    await cashRepository.markAdjusted(mov.cashSessionId);
    return updated;
  },

  /** Anula un movimiento de caja (soft-void: se conserva para auditoría, sale de los totales).
   *  Deja huella de auditoría y, si la caja ya estaba cerrada, la marca AJUSTADA. */
  async deleteMovement(scope: RequestScope, id: string, reason?: string) {
    const branchId = requireActiveBranch(scope);
    const mov = await cashRepository.findMovement(id);
    if (!mov || mov.branchId !== branchId) throw new NotFoundError('Movimiento no encontrado');
    if (mov.voided) throw new ConflictError('El movimiento ya está anulado');
    await cashRepository.voidMovement(id, scope.userId, reason?.trim() || null);
    await cashRepository.createIntervention({
      branchId,
      cashSessionId: mov.cashSessionId,
      type: 'VOID',
      targetKind: 'MOVEMENT',
      targetId: id,
      beforeJson: JSON.stringify(snapshotMovement(mov)),
      afterJson: null,
      reason: reason?.trim() || null,
      createdByUserId: scope.userId,
    });
    await cashRepository.markAdjusted(mov.cashSessionId);
    return { success: true };
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
      amount: number; method: string; status: 'NORMAL' | 'ANULADO'; verify?: string | null; unregistered?: boolean;
    }[] = [];
    // Etapa 4 — REGULARIZACIONES: desglose de ventas no registradas por clasificación (subconjunto informativo).
    const regs = {
      cobradas: { count: 0, amount: 0 },
      noCobradas: { count: 0, amount: 0 },
      porVerificar: { count: 0, amount: 0 },
    };
    // Etapa 5 — DEUDAS PENDIENTES: snapshot itemizado de obligaciones del turno al cierre.
    const debts: { saleId: string; concepto: string; tipo: string; room: string | null; importe: number; time: Date; estado: string; folio: string | null }[] = [];

    for (const sale of sales) {
      const cancelled = sale.status === 'CANCELLED';
      const method = saleMethod(sale.payments);
      const info = sale.stayId ? stayInfo.get(sale.stayId) : undefined;
      const suffix = info?.room ? ` - Hab. ${info.room}` : '';
      const folio = info?.folioCode ?? null;
      if (cancelled) { anulaciones = round(anulaciones + Number(sale.total)); }

      // Ventas no registradas (regularizaciones): fuente única = la propia venta marcada.
      if (!cancelled && sale.unregistered) {
        const amount = Number(sale.total);
        const vs = sale.verifyStatus ?? 'POR_VERIFICAR';
        if (vs === 'REGULARIZADA') { regs.cobradas.count++; regs.cobradas.amount = round(regs.cobradas.amount + amount); cards.ventasProductos = round(cards.ventasProductos + amount); }
        else if (vs === 'NO_COBRADA') { regs.noCobradas.count++; regs.noCobradas.amount = round(regs.noCobradas.amount + amount); cards.deudasPendientes = round(cards.deudasPendientes + amount); debts.push({ saleId: sale.id, concepto: sale.customerName || 'Venta no registrada', tipo: 'VENTA_NO_COBRADA', room: info?.room || null, importe: amount, time: sale.createdAt, estado: 'NO_COBRADA', folio }); }
        else { regs.porVerificar.count++; regs.porVerificar.amount = round(regs.porVerificar.amount + amount); }
        feed.push({ id: sale.id, saleId: sale.id, time: sale.createdAt, type: 'PRODUCTO', description: ((sale.customerName || 'Venta no registrada') + suffix).trim(), amount, method: 'PENDIENTE', status: 'NORMAL', verify: vs, unregistered: true });
        continue;
      }

      const paid = sale.payments.reduce((a, p) => a + Number(p.amount), 0);
      const pendiente = round(Math.max(0, Number(sale.total) - paid));
      if (!cancelled && pendiente > 0) {
        cards.deudasPendientes = round(cards.deudasPendientes + pendiente);
        const types = new Set(sale.items.map((it) => itemType(it.description, it.productId)));
        const tipo = types.has('RENOVACION') ? 'RENOVACION' : types.has('HOSPEDAJE') ? 'HOSPEDAJE' : types.has('PRODUCTO') ? 'PRODUCTO' : 'SERVICIO';
        const concepto = sale.items.map((it) => it.description).join(', ') || 'Venta';
        debts.push({ saleId: sale.id, concepto, tipo, room: info?.room || null, importe: pendiente, time: sale.createdAt, estado: paid > 0 ? 'PARCIAL' : 'PENDIENTE', folio });
      }

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

    // Detalle de pagos virtuales (para el ticket físico: MEDIO/HORA/MONTO/CLI/CONC/COD y marca de pago mixto).
    const VIRTUAL = new Set(['CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET']);
    const virtualPayments: {
      method: string; time: Date; amount: number; client: string; concept: string; code: string; mixed: boolean;
    }[] = [];
    for (const sale of sales) {
      if (sale.status === 'CANCELLED') continue;
      const types = new Set(sale.items.map((it) => itemType(it.description, it.productId)));
      const hasLodging = types.has('HOSPEDAJE') || types.has('RENOVACION') || types.has('SERVICIO');
      const hasProduct = types.has('PRODUCTO');
      const concept = types.has('HOSPEDAJE') ? 'HSP' : types.has('RENOVACION') ? 'REN' : types.has('PRODUCTO') ? 'PDT' : 'SVC';
      const info = sale.stayId ? stayInfo.get(sale.stayId) : undefined;
      const client = (info?.guest || sale.customerName || 'Venta').trim();
      for (const p of sale.payments) {
        if (!VIRTUAL.has(p.method)) continue;
        virtualPayments.push({
          method: p.method,
          time: p.createdAt,
          amount: Number(p.amount),
          client,
          concept,
          code: p.reference ?? '',
          mixed: hasLodging && hasProduct,
        });
      }
    }
    virtualPayments.sort((a, b) => b.time.getTime() - a.time.getTime());

    const byMethod: Record<string, number> = {};
    for (const m of PAYMENT_METHODS) byMethod[m] = await cashRepository.paymentsTotal(id, m);
    cards.efectivo = byMethod['CASH'] ?? 0;
    const total = round(Object.values(byMethod).reduce((a, b) => a + b, 0));

    // Huella de auditoría: intervenciones posteriores sobre esta caja (correcciones, anulaciones, reaperturas).
    const interventionRows = await cashRepository.listInterventions(id);
    const interventionUserIds = [...new Set(interventionRows.map((r) => r.createdByUserId).filter((x): x is string => !!x))];
    const interventionNames = interventionUserIds.length ? await cashRepository.userNames(interventionUserIds) : new Map<string, string>();
    const interventions = interventionRows.map((r) => ({
      id: r.id,
      type: r.type,
      targetKind: r.targetKind,
      targetId: r.targetId,
      before: r.beforeJson ? (JSON.parse(r.beforeJson) as unknown) : null,
      after: r.afterJson ? (JSON.parse(r.afterJson) as unknown) : null,
      reason: r.reason,
      createdAt: r.createdAt,
      user: r.createdByUserId ? (interventionNames.get(r.createdByUserId) ?? null) : null,
    }));

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
        denominations: parseDenoms(session.closingDenominations),
      },
      cards,
      methodBar: { byMethod, ingresos: movIn, egresos: movOut, anulaciones, total },
      movements: feed,
      virtualPayments,
      interventions,
      regularizaciones: regs,
      deudas: debts.sort((a, b) => b.time.getTime() - a.time.getTime()),
    };
  },
};
