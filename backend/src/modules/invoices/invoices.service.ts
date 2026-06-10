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
    if (dto.saleId) {
      const sale = await prisma.sale.findUnique({ where: { id: dto.saleId } });
      if (!sale || sale.branchId !== branchId) throw new ValidationError('Venta inválida');
      if (sale.status === 'CANCELLED') throw new ValidationError('No se puede facturar una venta anulada');
      total = Number(sale.total);
    }
    if (total <= 0) throw new ValidationError('El total debe ser mayor a cero');

    const { subtotal, taxAmount } = computeTax(total);

    let invoice: InvoiceWithRelations;
    try {
      invoice = await invoicesRepository.issue({
        branchId,
        saleId: dto.saleId ?? null,
        type: dto.type,
        customerName: dto.customerName,
        customerDoc: dto.customerDoc || null,
        subtotal,
        taxAmount,
        total,
        createdByUserId: scope.userId,
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
