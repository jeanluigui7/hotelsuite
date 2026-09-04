import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { pageMeta } from '../../shared/pagination';
import { prisma } from '../../config/prisma';
import { requireActiveBranch } from '../../shared/scope';
import type { RequestScope } from '../../shared/context';
import { guestsRepository } from './guests.repository';
import type { CreateGuestDto, UpdateGuestDto, BlacklistGuestDto } from './guests.schema';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Fila de cliente enriquecida con estadísticas reales (reservas, gasto, puntos, última estancia). */
export interface GuestRow {
  id: string; documentType: string; documentNumber: string; firstName: string; lastName: string | null;
  phone: string | null; email: string | null; nationality: string | null; status: string;
  reservas: number; gastoTotal: number; promedio: number; points: number; lastStay: Date | null;
  blacklisted: boolean; blacklistReason: string | null; blacklistedAt: Date | null; blacklistedBy: string | null;
}

interface ListGuestParams {
  search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; page?: number; pageSize?: number; blacklisted?: boolean;
}

/** Agregados de estancias por cliente (reservas, gasto = suma de precios pactados, última estancia). */
async function stayAggregates(guestIds: string[]): Promise<Map<string, { reservas: number; gasto: number; lastStay: Date | null }>> {
  const map = new Map<string, { reservas: number; gasto: number; lastStay: Date | null }>();
  if (!guestIds.length) return map;
  const grouped = await prisma.stay.groupBy({
    by: ['guestId'],
    where: { status: { not: 'CANCELLED' }, guestId: { in: guestIds } },
    _count: { _all: true },
    _sum: { priceAgreed: true },
    _max: { checkInAt: true },
  });
  for (const g of grouped) {
    map.set(g.guestId, { reservas: g._count._all, gasto: Number(g._sum.priceAgreed ?? 0), lastStay: g._max.checkInAt ?? null });
  }
  return map;
}

/** Guests are global (no branch scope). */
export const guestsService = {
  /** Construye las filas enriquecidas (todas las coincidencias) ordenadas según el criterio pedido. */
  async enrichedRows(params: ListGuestParams): Promise<GuestRow[]> {
    const where: Prisma.GuestWhereInput = {};
    if (params.search) {
      const q = params.search;
      where.OR = [
        { firstName: { contains: q } }, { lastName: { contains: q } },
        { documentNumber: { contains: q } }, { phone: { contains: q } }, { nationality: { contains: q } },
      ];
    }
    if (params.blacklisted !== undefined) where.blacklisted = params.blacklisted;

    const guests = await prisma.guest.findMany({ where, take: 10000 });
    const agg = await stayAggregates(guests.map((g) => g.id));
    // Nombres de quien realizó el bloqueo (solo para los que están en lista negra).
    const blockerIds = [...new Set(guests.filter((g) => g.blacklisted && g.blacklistedByUserId).map((g) => g.blacklistedByUserId as string))];
    const blockers = blockerIds.length ? await prisma.user.findMany({ where: { id: { in: blockerIds } }, select: { id: true, name: true, email: true } }) : [];
    const blockerMap = new Map(blockers.map((u) => [u.id, u.name || u.email]));

    const rows: GuestRow[] = guests.map((g) => {
      const a = agg.get(g.id) ?? { reservas: 0, gasto: 0, lastStay: null };
      return {
        id: g.id, documentType: g.documentType, documentNumber: g.documentNumber,
        firstName: g.firstName, lastName: g.lastName, phone: g.phone, email: g.email,
        nationality: g.nationality, status: g.status,
        reservas: a.reservas, gastoTotal: round2(a.gasto), promedio: a.reservas ? round2(a.gasto / a.reservas) : 0,
        points: Math.floor(a.gasto), lastStay: a.lastStay, // puntos = 1 por sol de gasto histórico
        blacklisted: g.blacklisted, blacklistReason: g.blacklistReason, blacklistedAt: g.blacklistedAt,
        blacklistedBy: g.blacklistedByUserId ? (blockerMap.get(g.blacklistedByUserId) ?? null) : null,
      };
    });

    const dir = params.sortDir === 'asc' ? 1 : -1;
    const cmp = (a: GuestRow, b: GuestRow): number => {
      switch (params.sortBy) {
        case 'lastStay': return ((a.lastStay?.getTime() ?? 0) - (b.lastStay?.getTime() ?? 0)) * dir;
        case 'reservations': case 'reservas': return (a.reservas - b.reservas) * dir;
        case 'spend': case 'gastoTotal': return (a.gastoTotal - b.gastoTotal) * dir;
        case 'points': return (a.points - b.points) * dir;
        case 'document': case 'documentNumber': return a.documentNumber.localeCompare(b.documentNumber) * dir;
        default: return `${a.firstName} ${a.lastName ?? ''}`.localeCompare(`${b.firstName} ${b.lastName ?? ''}`) * dir;
      }
    };
    return rows.sort(cmp);
  },

  async list(params: ListGuestParams) {
    const rows = await this.enrichedRows(params);
    const total = rows.length;
    const pageSize = params.pageSize ?? 20;
    const page = params.page ?? 1;
    const skip = (page - 1) * pageSize;
    return { items: rows.slice(skip, skip + pageSize), meta: pageMeta({ page, pageSize } as Parameters<typeof pageMeta>[0], total) };
  },

  /**
   * Cards del módulo Clientes con datos reales. Total de clientes e ingresos totales son globales
   * sensibles: solo para administración (settings:view). Recepción recibe null en esos dos campos.
   */
  async stats(scope: RequestScope) {
    const admin = scope.isSuperAdmin || scope.permissions.includes('settings:view');
    const [totalClientes, agg] = await Promise.all([
      prisma.guest.count(),
      prisma.stay.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { priceAgreed: true } }),
    ]);
    const ingresosTotales = round2(Number(agg._sum.priceAgreed ?? 0));
    const startMonth = new Date();
    startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const activosMesRows = await prisma.stay.findMany({ where: { checkInAt: { gte: startMonth } }, distinct: ['guestId'], select: { guestId: true } });
    return {
      totalClientes: admin ? totalClientes : null,
      puntosDistribuidos: Math.floor(ingresosTotales),
      ingresosTotales: admin ? ingresosTotales : null,
      promedioPorCliente: totalClientes ? round2(ingresosTotales / totalClientes) : 0,
      activosMes: admin ? activosMesRows.length : null,
    };
  },

  /** Clientes en Lista Negra (con motivo, fecha y quién bloqueó). */
  async blacklist() {
    const rows = await this.enrichedRows({ blacklisted: true, sortBy: 'lastStay', sortDir: 'desc' });
    return rows.map((r) => ({
      id: r.id, documentNumber: r.documentNumber, firstName: r.firstName, lastName: r.lastName,
      reason: r.blacklistReason, at: r.blacklistedAt, by: r.blacklistedBy,
    }));
  },

  /** Agrega un cliente a la Lista Negra (recepción + admin). Motivo obligatorio. */
  async addToBlacklist(scope: RequestScope, id: string, dto: BlacklistGuestDto) {
    await this.getById(id);
    return guestsRepository.update(id, {
      blacklisted: true, blacklistReason: dto.reason, blacklistedAt: new Date(), blacklistedByUserId: scope.userId,
    });
  },

  /** Quita a un cliente de la Lista Negra (SOLO administración). */
  async removeFromBlacklist(id: string) {
    await this.getById(id);
    return guestsRepository.update(id, {
      blacklisted: false, blacklistReason: null, blacklistedAt: null, blacklistedByUserId: null,
    });
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
