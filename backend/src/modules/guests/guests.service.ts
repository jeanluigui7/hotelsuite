import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { guestsRepository } from './guests.repository';
import type { CreateGuestDto, UpdateGuestDto } from './guests.schema';

const SORTABLE = ['firstName', 'lastName', 'documentNumber', 'createdAt'] as const;

/** Guests are global (no branch scope). */
export const guestsService = {
  async list(params: PaginationParams) {
    const where: Prisma.GuestWhereInput = {};
    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search } },
        { lastName: { contains: params.search } },
        { documentNumber: { contains: params.search } },
      ];
    }
    const { skip, take } = toPrismaPaging(params);
    const [items, total] = await Promise.all([
      guestsRepository.list({ where, skip, take, orderBy: buildOrderBy(params, SORTABLE, 'firstName') }),
      guestsRepository.count(where),
    ]);
    return { items, meta: pageMeta(params, total) };
  },

  async getById(id: string) {
    const guest = await guestsRepository.findById(id);
    if (!guest) throw new NotFoundError('Cliente no encontrado');
    return guest;
  },

  async create(dto: CreateGuestDto) {
    const existing = await guestsRepository.findByDocument(dto.documentType, dto.documentNumber);
    if (existing) throw new ConflictError('Ya existe un cliente con ese documento');
    return guestsRepository.create({
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      firstName: dto.firstName,
      lastName: dto.lastName || null,
      phone: dto.phone || null,
      email: dto.email || null,
      notes: dto.notes || null,
      status: dto.status,
    });
  },

  async update(id: string, dto: UpdateGuestDto) {
    const existing = await this.getById(id);
    if (
      dto.documentType &&
      dto.documentNumber &&
      (dto.documentType !== existing.documentType || dto.documentNumber !== existing.documentNumber)
    ) {
      const dup = await guestsRepository.findByDocument(dto.documentType, dto.documentNumber);
      if (dup && dup.id !== id) throw new ConflictError('Ya existe un cliente con ese documento');
    }
    return guestsRepository.update(id, {
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      firstName: dto.firstName,
      lastName: dto.lastName === '' ? null : dto.lastName,
      phone: dto.phone === '' ? null : dto.phone,
      email: dto.email === '' ? null : dto.email,
      notes: dto.notes === '' ? null : dto.notes,
      status: dto.status,
    });
  },

  async remove(id: string) {
    await this.getById(id);
    return guestsRepository.delete(id);
  },
};
