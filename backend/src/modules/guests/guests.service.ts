import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors';
import {
  buildOrderBy,
  pageMeta,
  toPrismaPaging,
  type PaginationParams,
} from '../../shared/pagination';
import { prisma } from '../../config/prisma';
import { requireActiveBranch } from '../../shared/scope';
import type { RequestScope } from '../../shared/context';
import { guestsRepository } from './guests.repository';
import type { CreateGuestDto, UpdateGuestDto } from './guests.schema';

const round2 = (n: number): number => Math.round(n * 100) / 100;

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

  /**
   * Busca un huésped por documento y devuelve sus deudas pendientes en la sucursal
   * activa (ventas/servicios sin pagar + estancias con saldo). Para el check-in.
   */
  async lookup(scope: RequestScope, documentNumber: string) {
    const branchId = requireActiveBranch(scope);
    const guest = await prisma.guest.findFirst({ where: { documentNumber } });
    if (!guest) return { guest: null, debts: { items: [], total: 0 } };

    const stays = await prisma.stay.findMany({ where: { branchId, guestId: guest.id } });
    const stayIds = stays.map((s) => s.id);
    const sales = await prisma.sale.findMany({
      where: { branchId, status: 'OPEN', OR: [{ guestId: guest.id }, { stayId: { in: stayIds } }] },
      include: { items: { select: { description: true } }, payments: { select: { amount: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const items: { type: string; label: string; amount: number; date: Date }[] = [];
    for (const s of sales) {
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      const due = round2(Number(s.total) - paid);
      if (due > 0.001) {
        const desc = s.items.map((i) => i.description).filter((d): d is string => !!d).slice(0, 2).join(', ');
        items.push({ type: 'service', label: `Adeudo de servicio/productos: ${desc || 'venta'}`, amount: due, date: s.createdAt });
      }
    }
    for (const st of stays) {
      const bal = st.balanceDue ? Number(st.balanceDue) : 0;
      if (bal > 0.001) items.push({ type: 'room', label: `Debe la habitación del día ${st.checkInAt.toLocaleDateString('es-PE')}`, amount: round2(bal), date: st.checkInAt });
    }
    const total = round2(items.reduce((a, i) => a + i.amount, 0));
    return {
      guest: { id: guest.id, documentType: guest.documentType, documentNumber: guest.documentNumber, firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone },
      debts: { items, total },
    };
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
