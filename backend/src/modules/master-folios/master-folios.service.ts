import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { staysService } from '../stays/stays.service';
import { invoicesService } from '../invoices/invoices.service';
import { masterFoliosRepository, type MasterFolioWithStays } from './master-folios.repository';
import type { CreateMasterFolioDto, InvoiceMasterDto, UpdateMasterFolioDto } from './master-folios.schema';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const isRoomLine = (d: string) => /^tarifa[:\s]/i.test(d) || /pernocta|renovaci|tiempo extra|extensi/i.test(d);
const isRenewal = (d: string) => /renovaci|tiempo extra|extensi/i.test(d);
function conceptOfLine(desc: string, productId: string | null): string {
  if (/penalidad|multa|mora|tardanza|da[ñn]o|rotura/i.test(desc)) return 'PENALIDAD';
  if (isRenewal(desc)) return 'RENOVACION';
  if (!productId && /^tarifa[:\s]|pernocta|hospedaje|early|d[ií]a hotelero/i.test(desc)) return 'HOSPEDAJE';
  return productId ? 'PRODUCTO' : 'SERVICIO';
}

interface BillLine { key: string; stayId: string; folioCode: string | null; saleItemId: string | null; concept: string; description: string; quantity: number; amount: number; invoiced: number; pending: number }

/** Construye las líneas facturables (con lo ya facturado y lo pendiente) para un conjunto de estancias. */
async function computeBillableLines(branchId: string, stayIds: string[]): Promise<BillLine[]> {
  const ids = [...new Set(stayIds)];
  if (!ids.length) return [];
  const [stays, sales] = await Promise.all([
    prisma.stay.findMany({ where: { id: { in: ids }, branchId }, select: { id: true, folioCode: true, priceAgreed: true } }),
    prisma.sale.findMany({ where: { stayId: { in: ids }, status: { not: 'CANCELLED' } }, include: { items: true } }),
  ]);
  const saleIds = sales.map((s) => s.id);
  const [invLines, legacyInvoices] = await Promise.all([
    prisma.invoiceLine.findMany({ where: { stayId: { in: ids } }, select: { saleItemId: true, stayId: true, concept: true, amount: true } }),
    saleIds.length ? prisma.invoice.findMany({ where: { branchId, status: 'ISSUED', saleId: { in: saleIds } }, select: { saleId: true } }) : Promise.resolve([]),
  ]);
  const invBySaleItem = new Map<string, number>();
  const invHospedajeByStay = new Map<string, number>();
  const coveredSaleItems = new Set<string>();
  for (const l of invLines) {
    if (l.saleItemId) { invBySaleItem.set(l.saleItemId, round2((invBySaleItem.get(l.saleItemId) ?? 0) + Number(l.amount))); coveredSaleItems.add(l.saleItemId); }
    else if (l.concept === 'HOSPEDAJE' && l.stayId) invHospedajeByStay.set(l.stayId, round2((invHospedajeByStay.get(l.stayId) ?? 0) + Number(l.amount)));
  }
  // Ventas facturadas por el flujo antiguo (Invoice.saleId sin InvoiceLine): sus ítems ya están facturados.
  const legacySaleIds = new Set(legacyInvoices.map((i) => i.saleId).filter((x): x is string => !!x));
  const folioByStay = new Map(stays.map((s) => [s.id, s.folioCode]));

  const out: BillLine[] = [];
  for (const st of stays) {
    const habit = round2(Number(st.priceAgreed));
    if (habit > 0) {
      const inv = invHospedajeByStay.get(st.id) ?? 0;
      out.push({ key: `H:${st.id}`, stayId: st.id, folioCode: st.folioCode, saleItemId: null, concept: 'HOSPEDAJE', description: `Hospedaje ${st.folioCode ?? ''}`.trim(), quantity: 1, amount: habit, invoiced: inv, pending: round2(Math.max(0, habit - inv)) });
    }
  }
  for (const s of sales) {
    for (const it of s.items) {
      if (isRoomLine(it.description) && !isRenewal(it.description)) continue; // "Tarifa:" = hospedaje (ya representado)
      const amount = round2(Number(it.subtotal));
      let inv = invBySaleItem.get(it.id) ?? 0;
      if (inv <= 0 && !coveredSaleItems.has(it.id) && legacySaleIds.has(s.id)) inv = amount; // facturado por flujo antiguo
      out.push({
        key: `S:${it.id}`, stayId: s.stayId!, folioCode: folioByStay.get(s.stayId!) ?? null, saleItemId: it.id,
        concept: conceptOfLine(it.description, it.productId), description: it.description, quantity: it.quantity, amount, invoiced: inv, pending: round2(Math.max(0, amount - inv)),
      });
    }
  }
  return out;
}

function serialize(m: MasterFolioWithStays) {
  return {
    id: m.id,
    code: m.code,
    payerName: m.payerName,
    payerDoc: m.payerDoc,
    payerRuc: m.payerRuc,
    payerAddress: m.payerAddress,
    status: m.status,
    notes: m.notes,
    stayCount: m.stays.length,
    createdAt: m.createdAt,
  };
}

export const masterFoliosService = {
  async list(scope: RequestScope, params: PaginationParams) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.MasterFolioWhereInput = { branchId };
    if (params.search) {
      where.OR = [
        { code: { contains: params.search } },
        { payerName: { contains: params.search } },
        { payerRuc: { contains: params.search } },
        { payerDoc: { contains: params.search } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      masterFoliosRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      masterFoliosRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async detail(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const stayIds = master.stays.map((s) => s.stayId);
    const summaries = await staysService.folioSummaries(scope, stayIds);
    const totals = summaries.reduce(
      (acc, s) => ({
        total: round2(acc.total + s.total),
        paid: round2(acc.paid + s.paid),
        pending: round2(acc.pending + s.pending),
        invoiced: round2(acc.invoiced + s.invoiced),
      }),
      { total: 0, paid: 0, pending: 0, invoiced: 0 },
    );
    return { ...serialize(master), payer: { name: master.payerName, doc: master.payerDoc, ruc: master.payerRuc, address: master.payerAddress }, stays: summaries, totals };
  },

  async create(scope: RequestScope, dto: CreateMasterFolioDto) {
    const branchId = requireActiveBranch(scope);
    const created = await masterFoliosRepository.create({
      branchId,
      payerName: dto.payerName.trim(),
      payerDoc: dto.payerDoc?.trim() || null,
      payerRuc: dto.payerRuc?.trim() || null,
      payerAddress: dto.payerAddress?.trim() || null,
      notes: dto.notes?.trim() || null,
      createdByUserId: scope.userId,
    });
    return serialize(created);
  },

  async update(scope: RequestScope, id: string, dto: UpdateMasterFolioDto) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const data: Prisma.MasterFolioUpdateInput = {};
    if (dto.payerName !== undefined) data.payerName = dto.payerName.trim();
    if (dto.payerDoc !== undefined) data.payerDoc = dto.payerDoc.trim() || null;
    if (dto.payerRuc !== undefined) data.payerRuc = dto.payerRuc.trim() || null;
    if (dto.payerAddress !== undefined) data.payerAddress = dto.payerAddress.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    return serialize(await masterFoliosRepository.update(id, data));
  },

  async addStay(scope: RequestScope, id: string, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const stay = await prisma.stay.findUnique({ where: { id: stayId }, select: { branchId: true } });
    if (!stay || stay.branchId !== branchId) throw new ValidationError('Estancia inválida');
    const existing = await masterFoliosRepository.findStayLink(stayId);
    if (existing) {
      if (existing.masterFolioId === id) throw new ConflictError('La estancia ya está en este folio maestro');
      throw new ConflictError('La estancia ya pertenece a otro folio maestro');
    }
    await masterFoliosRepository.addStay(id, stayId);
    return this.detail(scope, id);
  },

  async removeStay(scope: RequestScope, id: string, stayId: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    await masterFoliosRepository.removeStay(id, stayId);
    return this.detail(scope, id);
  },

  /** Conceptos facturables del maestro (por estancia), con lo pendiente por facturar. */
  async billable(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const lines = await computeBillableLines(branchId, master.stays.map((s) => s.stayId));
    const pendingTotal = round2(lines.reduce((a, l) => a + l.pending, 0));
    return { payer: { name: master.payerName, doc: master.payerDoc, ruc: master.payerRuc, address: master.payerAddress }, lines, pendingTotal };
  },

  /** Facturación selectiva: emite un comprobante al pagador por las líneas elegidas (su parte pendiente). */
  async invoice(scope: RequestScope, id: string, dto: InvoiceMasterDto) {
    const branchId = requireActiveBranch(scope);
    const master = await masterFoliosRepository.findById(id);
    if (!master || master.branchId !== branchId) throw new NotFoundError('Folio maestro no encontrado');
    const all = await computeBillableLines(branchId, master.stays.map((s) => s.stayId));
    const byKey = new Map(all.map((l) => [l.key, l]));
    const selected = dto.lineKeys.map((k) => byKey.get(k)).filter((l): l is BillLine => !!l && l.pending > 0);
    if (!selected.length) throw new ValidationError('Las líneas seleccionadas no tienen saldo pendiente por facturar');
    const stayIds = new Set(selected.map((l) => l.stayId));
    const invoice = await invoicesService.issueSelective(scope, {
      type: dto.type,
      customerName: (dto.customerName?.trim() || master.payerName),
      customerDoc: dto.customerDoc?.trim() || master.payerRuc || master.payerDoc || null,
      customerAddress: dto.customerAddress?.trim() || master.payerAddress || null,
      masterFolioId: id,
      stayId: stayIds.size === 1 ? [...stayIds][0] : null,
      lines: selected.map((l) => ({ saleItemId: l.saleItemId, stayId: l.stayId, concept: l.concept, description: l.description, quantity: l.quantity, amount: l.pending })),
    });
    // Si ya no queda nada pendiente en el maestro, marcarlo como facturado.
    const remaining = await computeBillableLines(branchId, master.stays.map((s) => s.stayId));
    if (remaining.every((l) => l.pending <= 0.001)) await masterFoliosRepository.update(id, { status: 'BILLED' });
    return { invoice, detail: await this.detail(scope, id) };
  },
};
