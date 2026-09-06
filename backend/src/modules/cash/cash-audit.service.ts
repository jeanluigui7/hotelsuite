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

interface AuditItem { paymentId: string; saleId: string; concept: string; amount: number; gross: number; commission: number; time: Date; }
interface AuditGroup {
  method: string; code: string | null; amount: number; grossAmount: number; commissionAmount: number; ops: number;
  state: 'VERIFICADO' | 'PENDIENTE' | 'SIN_CODIGO' | 'EN_REVISION'; duplicate: boolean;
  lastTime: Date; states: Set<string>; items: AuditItem[];
}

function conceptOf(items: { description: string; productId: string | null }[]): string {
  const d = items.map((i) => i.description).filter(Boolean);
  return d.length ? (d.length > 1 ? `${d[0]} +${d.length - 1}` : d[0]) : 'Venta';
}

async function loadVirtualPayments(branchId: string, sessionId: string) {
  return prisma.payment.findMany({
    where: { cashSessionId: sessionId, method: { in: VIRTUAL }, sale: { status: { not: 'CANCELLED' } } },
    include: { sale: { include: { items: { select: { description: true, productId: true } } } } },
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

    // Esperado virtual por método (= byMethod de virtuales; no incluye efectivo ni vuelto).
    // Neto = lo que registra el sistema; Bruto = lo realmente cobrado en POS (snapshot histórico
    // neto + comisión). Sin snapshot, el bruto cae al neto (no se reconstruye con la tasa vigente).
    const esperadoByMethod: Record<string, number> = {};
    const grossByMethod: Record<string, number> = {};
    const grossOf = (p: (typeof pays)[number]): number => (p.grossCharged != null ? Number(p.grossCharged) : Number(p.amount));
    const commOf = (p: (typeof pays)[number]): number => (p.commissionAmount != null ? Number(p.commissionAmount) : 0);
    for (const p of pays) {
      esperadoByMethod[p.method] = round((esperadoByMethod[p.method] ?? 0) + Number(p.amount));
      grossByMethod[p.method] = round((grossByMethod[p.method] ?? 0) + grossOf(p));
    }
    const esperadoTotal = round(Object.values(esperadoByMethod).reduce((a, b) => a + b, 0));
    const grossTotal = round(Object.values(grossByMethod).reduce((a, b) => a + b, 0));

    // Agrupar por método + código (código vacío = SIN_CODIGO, cada pago en su propio grupo).
    const groupsMap = new Map<string, AuditGroup>();
    for (const p of pays) {
      const code = (p.reference ?? '').trim() || null;
      const key = code ? `${p.method}|${code}` : `${p.method}|__nocode__|${p.id}`;
      let g = groupsMap.get(key);
      if (!g) { g = { method: p.method, code, amount: 0, grossAmount: 0, commissionAmount: 0, ops: 0, state: 'PENDIENTE', duplicate: false, lastTime: p.createdAt, states: new Set(), items: [] }; groupsMap.set(key, g); }
      g.amount = round(g.amount + Number(p.amount));
      g.grossAmount = round(g.grossAmount + grossOf(p));
      g.commissionAmount = round(g.commissionAmount + commOf(p));
      g.ops += 1;
      g.states.add(p.verifyState ?? 'PENDIENTE');
      if (p.createdAt > g.lastTime) g.lastTime = p.createdAt;
      g.items.push({ paymentId: p.id, saleId: p.saleId, concept: conceptOf(p.sale.items), amount: Number(p.amount), gross: grossOf(p), commission: commOf(p), time: p.createdAt });
    }
    // Estado derivado por grupo.
    for (const g of groupsMap.values()) {
      if (!g.code) g.state = 'SIN_CODIGO';
      else if ([...g.states].every((s) => s === 'VERIFICADO')) g.state = 'VERIFICADO';
      else if (g.states.has('EN_REVISION')) g.state = 'EN_REVISION';
      else g.state = 'PENDIENTE';
    }
    const groups = [...groupsMap.values()];

    // Duplicados: un mismo código usado en más de un grupo (p. ej. distinto método).
    const codeCount = new Map<string, number>();
    for (const g of groups) if (g.code) codeCount.set(g.code, (codeCount.get(g.code) ?? 0) + 1);
    for (const g of groups) if (g.code && (codeCount.get(g.code) ?? 0) > 1) g.duplicate = true;

    const verifiedAmount = round(groups.filter((g) => g.state === 'VERIFICADO').reduce((a, g) => a + g.amount, 0));
    const verifiedOps = groups.filter((g) => g.state === 'VERIFICADO').reduce((a, g) => a + g.ops, 0);
    const pendingAmount = round(groups.filter((g) => g.state === 'PENDIENTE' || g.state === 'EN_REVISION').reduce((a, g) => a + g.amount, 0));
    const sinCodigoCount = groups.filter((g) => g.state === 'SIN_CODIGO').length;
    const duplicateCount = groups.filter((g) => g.duplicate).length;
    const enRevisionCount = groups.filter((g) => g.state === 'EN_REVISION').length;
    const difference = round(esperadoTotal - verifiedAmount);

    const commissionTotal = round(grossTotal - esperadoTotal);

    return {
      esperado: { byMethod: esperadoByMethod, total: esperadoTotal, grossByMethod, grossTotal, commissionTotal },
      groups: groups
        .sort((a, b) => b.lastTime.getTime() - a.lastTime.getTime())
        .map((g) => ({
          method: g.method, code: g.code, amount: g.amount, grossAmount: g.grossAmount, commissionAmount: g.commissionAmount, ops: g.ops, state: g.state, duplicate: g.duplicate,
          items: g.items.sort((x, y) => y.time.getTime() - x.time.getTime()),
        })),
      summary: { verifiedAmount, verifiedOps, pendingAmount, sinCodigoCount, duplicateCount, enRevisionCount, difference },
    };
  },

  /** Acción de auditoría sobre un grupo (método+código) o un pago: verificar, corregir código, en revisión. */
  async verifyVirtual(scope: RequestScope, sessionId: string, dto: { paymentIds?: string[]; method?: string; code?: string; action: 'VERIFY' | 'SET_CODE' | 'REVIEW'; newCode?: string }) {
    const branchId = requireActiveBranch(scope);
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session || session.branchId !== branchId) throw new NotFoundError('Turno no encontrado');

    // Determinar los pagos objetivo: por ids explícitos, o por método+código del grupo.
    let where: Record<string, unknown>;
    if (dto.paymentIds?.length) where = { id: { in: dto.paymentIds }, cashSessionId: sessionId };
    else if (dto.method && dto.code) where = { cashSessionId: sessionId, method: dto.method, reference: dto.code };
    else throw new ValidationError('Indica el grupo (método+código) o los pagos a auditar.');

    if (dto.action === 'SET_CODE') {
      if (!dto.newCode || !dto.newCode.trim()) throw new ValidationError('Ingresa el código de operación.');
      await prisma.payment.updateMany({ where, data: { reference: dto.newCode.trim(), verifyState: 'VERIFICADO', verifiedByUserId: scope.userId, verifiedAt: new Date() } });
    } else if (dto.action === 'REVIEW') {
      await prisma.payment.updateMany({ where, data: { verifyState: 'EN_REVISION', verifiedByUserId: scope.userId, verifiedAt: new Date() } });
    } else {
      await prisma.payment.updateMany({ where, data: { verifyState: 'VERIFICADO', verifiedByUserId: scope.userId, verifiedAt: new Date() } });
    }
    return this.virtualAudit(scope, sessionId);
  },
};
