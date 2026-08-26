import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { computeTax, invoicingProvider } from '../../shared/invoicing';
import { invoicesRepository, type InvoiceWithRelations } from './invoices.repository';
import type { IssueInvoiceDto } from './invoices.schema';

const SORTABLE = ['issuedAt', 'total', 'type', 'status'] as const;

/** Clasifica una línea de venta en un concepto de facturación (etiqueta del snapshot). */
function conceptOfLine(desc: string, productId: string | null): string {
  if (/penalidad|multa|mora|tardanza|da[ñn]o|rotura/i.test(desc)) return 'PENALIDAD';
  if (/renovaci|tiempo extra|extensi/i.test(desc)) return 'RENOVACION';
  if (!productId && /^tarifa[:\s]|pernocta|hospedaje|early|d[ií]a hotelero/i.test(desc)) return 'HOSPEDAJE';
  return productId ? 'PRODUCTO' : 'SERVICIO';
}

function serialize(inv: InvoiceWithRelations) {
  return {
    id: inv.id,
    type: inv.type,
    series: inv.series,
    number: inv.number,
    folio: `${inv.series}-${inv.number}`,
    saleId: inv.saleId,
    customerName: inv.customerName,
    customerDoc: inv.customerDoc,
    customerAddress: inv.customerAddress,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    total: inv.total,
    status: inv.status,
    providerStatus: inv.providerStatus,
    providerRef: inv.providerRef,
    issuedAt: inv.issuedAt,
    notesCount: inv.notes.length,
  };
}

export const invoicesService = {
  async issue(scope: RequestScope, dto: IssueInvoiceDto) {
    const branchId = requireActiveBranch(scope);

    let total = dto.total ?? 0;
    let stayId: string | null = null;
    let lines: { saleItemId: string | null; concept: string | null; description: string; quantity: number; amount: number }[] = [];
    if (dto.saleId) {
      const sale = await prisma.sale.findUnique({ where: { id: dto.saleId }, include: { items: true } });
      if (!sale || sale.branchId !== branchId) throw new ValidationError('Venta inválida');
      if (sale.status === 'CANCELLED') throw new ValidationError('No se puede facturar una venta anulada');
      total = Number(sale.total);
      stayId = sale.stayId ?? null;
      // Snapshot de líneas facturadas (habilita facturación por concepto y trazabilidad).
      lines = sale.items.map((it) => ({
        saleItemId: it.id,
        concept: conceptOfLine(it.description, it.productId),
        description: it.description,
        quantity: it.quantity,
        amount: Number(it.subtotal),
      }));
    }
    if (total <= 0) throw new ValidationError('El total debe ser mayor a cero');

    const { subtotal, taxAmount } = computeTax(total);

    let invoice: InvoiceWithRelations;
    try {
      invoice = await invoicesRepository.issue({
        branchId,
        saleId: dto.saleId ?? null,
        stayId,
        type: dto.type,
        customerName: dto.customerName,
        customerDoc: dto.customerDoc || null,
        customerAddress: dto.customerAddress || null,
        subtotal,
        taxAmount,
        total,
        createdByUserId: scope.userId,
        lines,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NO_FOLIO_SERIES')) {
        throw new ValidationError('No hay una serie de folios activa para ese tipo de comprobante');
      }
      throw err;
    }

    // Send to the (mock) provider and persist its response.
    const result = await invoicingProvider.issue({
      type: invoice.type,
      series: invoice.series,
      number: invoice.number,
      customerDoc: invoice.customerDoc,
      customerName: invoice.customerName,
      total: Number(invoice.total),
    });
    const updated = await invoicesRepository.update(invoice.id, {
      providerStatus: result.providerStatus,
      providerRef: result.providerRef,
    });
    return serialize(updated as InvoiceWithRelations);
  },

  /**
   * Emisión selectiva (facturación por concepto / multi-estancia): recibe líneas ya valoradas
   * (de uno o varios folios) y emite un comprobante al pagador, registrando cada InvoiceLine.
   */
  async issueSelective(scope: RequestScope, dto: {
    type: 'BOLETA' | 'FACTURA';
    customerName: string;
    customerDoc: string | null;
    customerAddress: string | null;
    masterFolioId: string | null;
    stayId: string | null;
    lines: { saleItemId: string | null; stayId: string | null; concept: string | null; description: string; quantity: number; amount: number }[];
  }) {
    const branchId = requireActiveBranch(scope);
    if (!dto.lines.length) throw new ValidationError('Selecciona al menos un concepto a facturar');
    const total = Math.round(dto.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    if (total <= 0) throw new ValidationError('El total a facturar debe ser mayor a cero');
    const { subtotal, taxAmount } = computeTax(total);

    let invoice: InvoiceWithRelations;
    try {
      invoice = await invoicesRepository.issue({
        branchId,
        saleId: null,
        stayId: dto.stayId,
        masterFolioId: dto.masterFolioId,
        type: dto.type,
        customerName: dto.customerName,
        customerDoc: dto.customerDoc,
        customerAddress: dto.customerAddress,
        subtotal,
        taxAmount,
        total,
        createdByUserId: scope.userId,
        lines: dto.lines,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NO_FOLIO_SERIES')) {
        throw new ValidationError('No hay una serie de folios activa para ese tipo de comprobante');
      }
      throw err;
    }
    const result = await invoicingProvider.issue({
      type: invoice.type,
      series: invoice.series,
      number: invoice.number,
      customerDoc: invoice.customerDoc,
      customerName: invoice.customerName,
      total: Number(invoice.total),
    });
    const updated = await invoicesRepository.update(invoice.id, { providerStatus: result.providerStatus, providerRef: result.providerRef });
    return serialize(updated as InvoiceWithRelations);
  },

  async getById(scope: RequestScope, id: string) {
    const inv = await invoicesRepository.findById(id);
    if (!inv || inv.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Comprobante no encontrado');
    return serialize(inv);
  },

  async list(scope: RequestScope, params: PaginationParams, filters: { type?: string; status?: string }) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.InvoiceWhereInput = { branchId };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (params.search) where.customerName = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      invoicesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'issuedAt') }),
      invoicesRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async void(scope: RequestScope, id: string) {
    const inv = await invoicesRepository.findById(id);
    if (!inv || inv.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Comprobante no encontrado');
    if (inv.status === 'VOIDED') throw new ConflictError('El comprobante ya está anulado');
    return serialize((await invoicesRepository.update(id, { status: 'VOIDED' })) as InvoiceWithRelations);
  },
};
