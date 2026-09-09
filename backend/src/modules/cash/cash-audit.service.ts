import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { prisma } from '../../config/prisma';

/**
 * Auditoría de MEDIOS DE PAGO VIRTUALES de un turno (Yape/Tarjeta/Transferencia/Plin/otros). Agrupa las
 * operaciones por MÉTODO + CÓDIGO de operación para verificar un solo pago aunque cubra varias líneas.
 * Los pagos virtuales NO afectan el arqueo físico de efectivo. Estado por pago en `Payment.verifyState`
 * (PENDIENTE/VERIFICADO/EN_REVISION; SIN_CODIGO se deriva cuando no hay `reference`).
 */
const VIRTUAL = ['CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET'];
const round = (n: number): number => Math.round(n * 100) / 100;

type AuditState = 'VERIFICADO' | 'PENDIENTE' | 'SIN_CODIGO' | 'EN_REVISION' | 'NO_EXISTE';
type EntryKind = 'PAYMENT' | 'MOVEMENT';
// Entrada unificada de auditoría: un pago de venta O un ingreso de caja virtual (Yape/Plin/etc.).
interface VEntry {
  kind: EntryKind; id: string; method: string; code: string | null; amount: number; gross: number; commission: number;
  concept: string; room: string | null; client: string; clientShort: string; verifyState: string | null; createdAt: Date;
}
interface AuditItem { kind: EntryKind; paymentId: string; saleId: string; concept: string; amount: number; gross: number; commission: number; time: Date; }
interface AuditGroup {
  method: string; code: string | null; amount: number; grossAmount: number; commissionAmount: number; ops: number;
  room: string | null; client: string; clientShort: string; concept: string;
  state: AuditState; duplicate: boolean;
  lastTime: Date; states: Set<string>; items: AuditItem[];
}

function conceptOf(items: { description: string; productId: string | null }[]): string {
  const d = items.map((i) => i.description).filter(Boolean);
  return d.length ? (d.length > 1 ? `${d[0]} +${d.length - 1}` : d[0]) : 'Venta';
}

/** Capitaliza cada palabra (para nombres en MAYÚSCULAS de RENIEC). */
function cap(s: string): string {
  return s.toLowerCase().replace(/(^|\s)([a-záéíóúñü])/g, (_, sp, c) => sp + c.toUpperCase());
}

/**
 * Nombre corto para comparar contra Yape/Plin: PRIMER NOMBRE + 3 letras del PRIMER APELLIDO + "*".
 * Solo visual (no altera el nombre almacenado). Si hay lastName separado: primer nombre de firstName +
 * primer apellido de lastName. Si lastName es null, firstName viene como "APELLIDOS NOMBRES" (RENIEC):
 * primer token = primer apellido; los nombres empiezan tras 2 apellidos (o tras 1 si solo hay 3 tokens).
 */
function shortName(firstName: string, lastName: string | null): string {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  if (ln) {
    const given = fn.split(/\s+/)[0] || fn;
    const sur = ln.split(/\s+/)[0] || ln;
    return `${cap(given)} ${cap(sur.slice(0, 3))}*`;
  }
  const t = fn.split(/\s+/).filter(Boolean);
  if (t.length <= 1) return cap(fn);
  const surname = t[0];
  const given = t.length >= 3 ? t[2] : t[1]; // 2 apellidos + nombres | apellido + nombre
  return `${cap(given)} ${cap(surname.slice(0, 3))}*`;
}

async function loadVirtualPayments(branchId: string, sessionId: string) {
  return prisma.payment.findMany({
    where: { cashSessionId: sessionId, method: { in: VIRTUAL }, sale: { status: { not: 'CANCELLED' } } },
    include: { sale: { include: { items: { select: { description: true, productId: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
}

/** Mapas hab.(número) y nombre de cliente por estancia / huésped, para enriquecer cada fila. */
async function loadContext(pays: Awaited<ReturnType<typeof loadVirtualPayments>>) {
  const stayIds = [...new Set(pays.map((p) => p.sale.stayId).filter((x): x is string => !!x))];
  const guestIds = [...new Set(pays.map((p) => p.sale.guestId).filter((x): x is string => !!x))];
  const stays = stayIds.length
    ? await prisma.stay.findMany({ where: { id: { in: stayIds } }, include: { room: { select: { number: true } }, guest: { select: { firstName: true, lastName: true } } } })
    : [];
  const guests = guestIds.length
    ? await prisma.guest.findMany({ where: { id: { in: guestIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const full = (g?: { firstName: string; lastName: string | null } | null): string => g ? `${g.firstName} ${g.lastName ?? ''}`.trim() : '';
  const short = (g?: { firstName: string; lastName: string | null } | null): string => g ? shortName(g.firstName, g.lastName) : '';
  const stayMap = new Map(stays.map((s) => [s.id, { room: s.room?.number ?? null, client: full(s.guest), clientShort: short(s.guest) }]));
  const guestMap = new Map(guests.map((g) => [g.id, { client: full(g), clientShort: short(g) }]));
  return { stayMap, guestMap };
}

/** Ingresos de caja por medio VIRTUAL (Yape/Plin/etc.): también se concilian por código. Sin anular. */
async function loadVirtualMovements(sessionId: string) {
  return prisma.cashMovement.findMany({
    where: { cashSessionId: sessionId, type: 'IN', method: { in: VIRTUAL }, voided: false },
    orderBy: { createdAt: 'asc' },
  });
}

export const cashAuditService = {
  /** Conciliación + agrupación por código de los medios virtuales del turno. */
  async virtualAudit(scope: RequestScope, sessionId: string) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');
    const pays = await loadVirtualPayments(branchId, sessionId);
    const movs = await loadVirtualMovements(sessionId);
    const { stayMap, guestMap } = await loadContext(pays);

    // Lista UNIFICADA: pagos de ventas + ingresos de caja virtuales (Yape/Plin/etc.). Ambos se
    // concilian por método+código; los ingresos de caja no tienen comisión ni cliente (usan su concepto).
    const entries: VEntry[] = [];
    for (const p of pays) {
      const ctx = p.sale.stayId ? stayMap.get(p.sale.stayId) : undefined;
      const gctx = p.sale.guestId ? guestMap.get(p.sale.guestId) : undefined;
      const concept = conceptOf(p.sale.items);
      const client = ctx?.client || gctx?.client || p.sale.customerName || concept;
      const clientShort = ctx?.clientShort || gctx?.clientShort || (p.sale.customerName ? shortName(p.sale.customerName, null) : concept);
      entries.push({
        kind: 'PAYMENT', id: p.id, method: p.method, code: (p.reference ?? '').trim() || null, amount: Number(p.amount),
        gross: p.grossCharged != null ? Number(p.grossCharged) : Number(p.amount), commission: p.commissionAmount != null ? Number(p.commissionAmount) : 0,
        concept, room: ctx?.room ?? null, client, clientShort, verifyState: p.verifyState, createdAt: p.createdAt,
      });
    }
    for (const m of movs) {
      const concept = m.concept || 'Ingreso';
      entries.push({
        kind: 'MOVEMENT', id: m.id, method: m.method as string, code: (m.reference ?? '').trim() || null, amount: Number(m.amount),
        gross: Number(m.amount), commission: 0, concept, room: null, client: concept, clientShort: concept, verifyState: m.verifyState, createdAt: m.createdAt,
      });
    }

    // Esperado virtual por método (= byMethod de virtuales; no incluye efectivo ni vuelto).
    // Neto = lo que registra el sistema; Bruto = lo realmente cobrado en POS (snapshot histórico
    // neto + comisión). Sin snapshot, el bruto cae al neto (no se reconstruye con la tasa vigente).
    const esperadoByMethod: Record<string, number> = {};
    const grossByMethod: Record<string, number> = {};
    for (const e of entries) {
      esperadoByMethod[e.method] = round((esperadoByMethod[e.method] ?? 0) + e.amount);
      grossByMethod[e.method] = round((grossByMethod[e.method] ?? 0) + e.gross);
    }
    const esperadoTotal = round(Object.values(esperadoByMethod).reduce((a, b) => a + b, 0));
    const grossTotal = round(Object.values(grossByMethod).reduce((a, b) => a + b, 0));

    // NUNCA agrupar automáticamente: CADA operación (pago o ingreso) es su PROPIA fila, aunque comparta
    // método y código con otra. Si el código se repite se marca como Duplicado (abajo) y el auditor
    // decide si agruparlas manualmente en el frontend (agrupación solo visual). key único por entrada.
    const groupsMap = new Map<string, AuditGroup>();
    for (const e of entries) {
      const key = `${e.kind}|${e.id}`;
      let g = groupsMap.get(key);
      if (!g) { g = { method: e.method, code: e.code, amount: 0, grossAmount: 0, commissionAmount: 0, ops: 0, room: e.room, client: e.client, clientShort: e.clientShort, concept: e.concept, state: 'PENDIENTE', duplicate: false, lastTime: e.createdAt, states: new Set(), items: [] }; groupsMap.set(key, g); }
      g.amount = round(g.amount + e.amount);
      g.grossAmount = round(g.grossAmount + e.gross);
      g.commissionAmount = round(g.commissionAmount + e.commission);
      g.ops += 1;
      g.states.add(e.verifyState ?? 'PENDIENTE');
      if (e.createdAt >= g.lastTime) { g.lastTime = e.createdAt; g.room = e.room; g.client = e.client; g.clientShort = e.clientShort; g.concept = e.concept; } // representante = el más reciente del grupo
      g.items.push({ kind: e.kind, paymentId: e.id, saleId: e.id, concept: e.concept, amount: e.amount, gross: e.gross, commission: e.commission, time: e.createdAt });
    }
    // Estado derivado por grupo. NO_EXISTE (auditado como inexistente) tiene prioridad.
    for (const g of groupsMap.values()) {
      if ([...g.states].every((s) => s === 'NO_EXISTE') && g.states.size > 0) g.state = 'NO_EXISTE';
      else if (!g.code) g.state = 'SIN_CODIGO';
      else if ([...g.states].every((s) => s === 'VERIFICADO')) g.state = 'VERIFICADO';
      else if (g.states.has('EN_REVISION')) g.state = 'EN_REVISION';
      else g.state = 'PENDIENTE';
    }
    const groups = [...groupsMap.values()];

    // Duplicados: un mismo código presente en más de UNA operación (mismo o distinto método). Se marca
    // como alerta; NO se fusionan (el auditor decide si agrupar). Cada operación queda separada y visible.
    const codeCount = new Map<string, number>();
    for (const g of groups) if (g.code) codeCount.set(g.code, (codeCount.get(g.code) ?? 0) + 1);
    for (const g of groups) if (g.code && (codeCount.get(g.code) ?? 0) > 1) g.duplicate = true;

    const verifiedAmount = round(groups.filter((g) => g.state === 'VERIFICADO').reduce((a, g) => a + g.amount, 0));
    const verifiedOps = groups.filter((g) => g.state === 'VERIFICADO').reduce((a, g) => a + g.ops, 0);
    const pendingAmount = round(groups.filter((g) => g.state === 'PENDIENTE' || g.state === 'EN_REVISION').reduce((a, g) => a + g.amount, 0));
    const sinCodigoCount = groups.filter((g) => g.state === 'SIN_CODIGO').length;
    const duplicateCount = groups.filter((g) => g.duplicate).length;
    const enRevisionCount = groups.filter((g) => g.state === 'EN_REVISION').length;
    const noExisteCount = groups.filter((g) => g.state === 'NO_EXISTE').length;
    const difference = round(esperadoTotal - verifiedAmount);

    const commissionTotal = round(grossTotal - esperadoTotal);

    return {
      esperado: { byMethod: esperadoByMethod, total: esperadoTotal, grossByMethod, grossTotal, commissionTotal },
      groups: groups
        .sort((a, b) => b.lastTime.getTime() - a.lastTime.getTime())
        .map((g) => ({
          method: g.method, code: g.code, amount: g.amount, grossAmount: g.grossAmount, commissionAmount: g.commissionAmount, ops: g.ops,
          room: g.room, client: g.client, clientShort: g.clientShort, concept: g.concept, time: g.lastTime,
          state: g.state, duplicate: g.duplicate,
          items: g.items.sort((x, y) => y.time.getTime() - x.time.getTime()),
        })),
      summary: { verifiedAmount, verifiedOps, pendingAmount, sinCodigoCount, duplicateCount, enRevisionCount, noExisteCount, difference },
    };
  },

  /**
   * Acción de auditoría sobre un grupo (método+código) o entradas explícitas: verificar, corregir
   * código, en revisión, inexistente. Aplica a PAGOS de venta y a INGRESOS de caja virtuales.
   */
  async verifyVirtual(
    scope: RequestScope,
    sessionId: string,
    dto: { paymentIds?: string[]; movementIds?: string[]; method?: string; code?: string; action: 'VERIFY' | 'SET_CODE' | 'REVIEW' | 'NOT_FOUND'; newCode?: string },
  ) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');

    // Datos a aplicar según la acción. Editar código NO verifica (queda PENDIENTE con el nuevo código).
    const stamp = { verifiedByUserId: scope.userId, verifiedAt: new Date() };
    let data: Record<string, unknown>;
    if (dto.action === 'SET_CODE') {
      if (!dto.newCode || !dto.newCode.trim()) throw new ValidationError('Ingresa el código de operación.');
      data = { reference: dto.newCode.trim(), verifyState: 'PENDIENTE', ...stamp };
    } else if (dto.action === 'REVIEW') data = { verifyState: 'EN_REVISION', ...stamp };
    else if (dto.action === 'NOT_FOUND') data = { verifyState: 'NO_EXISTE', ...stamp };
    else data = { verifyState: 'VERIFICADO', ...stamp };

    if (dto.method && dto.code) {
      // Grupo por método+código: afecta pagos e ingresos de caja con ese método y código.
      const base = { cashSessionId: sessionId, method: dto.method, reference: dto.code };
      await prisma.payment.updateMany({ where: base, data });
      await prisma.cashMovement.updateMany({ where: { ...base, type: 'IN' }, data });
    } else if (dto.paymentIds?.length || dto.movementIds?.length) {
      // Entradas explícitas (grupos SIN CÓDIGO): cada pago/ingreso por su id.
      if (dto.paymentIds?.length) await prisma.payment.updateMany({ where: { id: { in: dto.paymentIds }, cashSessionId: sessionId }, data });
      if (dto.movementIds?.length) await prisma.cashMovement.updateMany({ where: { id: { in: dto.movementIds }, cashSessionId: sessionId }, data });
    } else {
      throw new ValidationError('Indica el grupo (método+código) o las operaciones a auditar.');
    }
    return this.virtualAudit(scope, sessionId);
  },
};
