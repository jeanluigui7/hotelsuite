import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { notesRepository, type NoteWithRelations } from './notes.repository';
import type { CreateNoteDto } from './notes.schema';

const SORTABLE = ['issuedAt', 'type'] as const;

function serialize(n: NoteWithRelations) {
  return {
    id: n.id,
    type: n.type,
    folio: `${n.series}-${n.number}`,
    reason: n.reason,
    total: n.total,
    status: n.status,
    issuedAt: n.issuedAt,
    invoice: n.invoice ? { id: n.invoice.id, folio: `${n.invoice.series}-${n.invoice.number}`, type: n.invoice.type } : null,
  };
}

export const notesService = {
  async list(scope: RequestScope, params: PaginationParams, invoiceId?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.CreditDebitNoteWhereInput = { branchId };
    if (invoiceId) where.invoiceId = invoiceId;
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      notesRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'issuedAt') }),
      notesRepository.count(where),
    ]);
    return { items: rows.map(serialize), meta: pageMeta(params, total) };
  },

  async create(scope: RequestScope, dto: CreateNoteDto) {
    const branchId = requireActiveBranch(scope);
    const invoice = await prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice || invoice.branchId !== branchId) throw new ValidationError('Comprobante inválido');
    if (invoice.status === 'VOIDED') throw new ValidationError('El comprobante está anulado');
    try {
      const note = await notesRepository.issue({
        branchId,
        invoiceId: dto.invoiceId,
        type: dto.type,
        reason: dto.reason,
        total: dto.total,
        createdByUserId: scope.userId,
      });
      return serialize(note);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NO_FOLIO_SERIES')) {
        throw new ValidationError('No hay una serie de folios activa para notas (NOTE)');
      }
      throw err;
    }
  },

  async getById(scope: RequestScope, id: string) {
    const n = await notesRepository.findById(id);
    if (!n || n.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Nota no encontrada');
    return serialize(n);
  },
};
