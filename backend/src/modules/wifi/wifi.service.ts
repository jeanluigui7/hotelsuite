import type { RequestScope } from '../../shared/context';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { WIFI_CATEGORIES, type CreateWifiDto, type UpdateWifiDto, type BulkCreateWifiDto, type AssignWifiDto, type ImportWifiDto } from './wifi.schema';

type WifiRow = {
  id: string; ssid: string; password: string; code: string | null; category: string;
  used: boolean; assignedStayId: string | null; assignedRoom: string | null; assignedGuest: string | null;
  validMinutes: number | null; message: string | null;
};

/** Estado derivado: USADA | EN_USO | DISPONIBLE. */
function stateOf(c: { used: boolean; assignedStayId: string | null }): 'USADA' | 'EN_USO' | 'DISPONIBLE' {
  if (c.used) return 'USADA';
  if (c.assignedStayId) return 'EN_USO';
  return 'DISPONIBLE';
}

function serialize(c: WifiRow, admin: boolean) {
  // El VOUCHER (columna Code de Omada) es el único valor entregado al huésped. `password` queda
  // en la BD por compatibilidad, pero ya no se usa: siempre es igual al voucher.
  // SEGURIDAD: recepción (no admin) NUNCA recibe el código; se enmascara en la API, no solo en el CSS.
  const voucher = c.code || c.password || '';
  return {
    id: c.id, ssid: c.ssid, voucher: admin ? voucher : '', masked: !admin,
    category: c.category, used: c.used, state: stateOf(c), room: c.assignedRoom, guest: c.assignedGuest,
    validMinutes: c.validMinutes, message: c.message,
  };
}

/** Un usuario con settings:view (Gerente/Admin/Super) puede ver el voucher; recepción NO. */
function canRevealVoucher(scope: RequestScope): boolean {
  return scope.isSuperAdmin || scope.permissions.includes('settings:view');
}

export const wifiService = {
  /** Lista credenciales por categoría; oculta las usadas salvo showUsed. */
  async list(scope: RequestScope, opts: { category?: string; showUsed?: boolean; search?: string }) {
    const branchId = requireActiveBranch(scope);
    const where: Record<string, unknown> = { branchId };
    if (opts.category && WIFI_CATEGORIES.includes(opts.category as (typeof WIFI_CATEGORIES)[number])) where.category = opts.category;
    if (!opts.showUsed) where.used = false;
    if (opts.search) where.ssid = { contains: opts.search };
    const rows = await prisma.wifiCredential.findMany({ where, orderBy: [{ used: 'asc' }, { createdAt: 'desc' }], take: 1000 });
    const admin = canRevealVoucher(scope);
    return rows.map((c) => serialize(c as WifiRow, admin));
  },

  /** Conteos por categoría para las tarjetas y las pestañas. */
  async summary(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const rows = await prisma.wifiCredential.findMany({ where: { branchId }, select: { category: true, used: true, assignedStayId: true } });
    const out: Record<string, { total: number; available: number; inUse: number; used: number }> = {};
    for (const cat of WIFI_CATEGORIES) out[cat] = { total: 0, available: 0, inUse: 0, used: 0 };
    for (const c of rows) {
      const cat = WIFI_CATEGORIES.includes(c.category as (typeof WIFI_CATEGORIES)[number]) ? c.category : 'PERNOCTACION';
      const b = out[cat];
      if (c.used) { b.used++; continue; }
      b.total++;
      if (c.assignedStayId) b.inUse++;
      else b.available++;
    }
    return out;
  },

  async getById(scope: RequestScope, id: string) {
    const item = await prisma.wifiCredential.findUnique({ where: { id } });
    if (!item || item.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Credencial WiFi no encontrada');
    return item;
  },

  create(scope: RequestScope, dto: CreateWifiDto) {
    const branchId = requireActiveBranch(scope);
    const voucher = dto.voucher.trim();
    return prisma.wifiCredential.create({
      data: {
        branchId, ssid: dto.ssid, category: dto.category,
        code: voucher, password: voucher, voucher, note: dto.note || null,
        validMinutes: dto.category === 'GRATIS' ? dto.validMinutes ?? 60 : null,
        message: dto.category === 'GRATIS' ? dto.message || null : null,
      },
    });
  },

  /** Crea varias credenciales de una categoría con sus vouchers/cupones (columna Code de Omada). */
  async createBulk(scope: RequestScope, dto: BulkCreateWifiDto) {
    const branchId = requireActiveBranch(scope);
    const vouchers = [...new Set(dto.vouchers.map((v) => v.trim()).filter(Boolean))];
    if (!vouchers.length) throw new ValidationError('Ingresa al menos un voucher/cupón');
    // No duplicar un voucher (Code) que ya exista en la sucursal.
    const existing = new Set(
      (await prisma.wifiCredential.findMany({ where: { branchId, code: { in: vouchers } }, select: { code: true } }))
        .map((r) => r.code).filter((x): x is string => !!x),
    );
    const data = vouchers
      .filter((v) => !existing.has(v))
      .map((v) => ({
        branchId, ssid: dto.ssid, password: v, code: v, voucher: v, category: dto.category,
        validMinutes: dto.category === 'GRATIS' ? dto.validMinutes ?? 60 : null,
        message: dto.category === 'GRATIS' ? dto.message || null : null,
      }));
    if (!data.length) throw new ValidationError('Todos los vouchers ingresados ya existen.');
    const res = await prisma.wifiCredential.createMany({ data });
    return { created: res.count, duplicates: vouchers.length - data.length };
  },

  async update(scope: RequestScope, id: string, dto: UpdateWifiDto) {
    await this.getById(scope, id);
    const voucher = dto.voucher?.trim();
    return prisma.wifiCredential.update({
      where: { id },
      data: {
        ...(dto.ssid !== undefined ? { ssid: dto.ssid } : {}),
        ...(voucher !== undefined ? { code: voucher, password: voucher, voucher } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.validMinutes !== undefined ? { validMinutes: dto.validMinutes } : {}),
        ...(dto.message !== undefined ? { message: dto.message || null } : {}),
      },
    });
  },

  async remove(scope: RequestScope, id: string) {
    await this.getById(scope, id);
    await prisma.wifiCredential.delete({ where: { id } });
    return { success: true };
  },

  async bulkRemove(scope: RequestScope, ids: string[]) {
    const branchId = requireActiveBranch(scope);
    const res = await prisma.wifiCredential.deleteMany({ where: { id: { in: ids }, branchId } });
    return { deleted: res.count };
  },

  /** Asigna una credencial a la estancia activa de una habitación (reemplaza la anterior de esa estancia). */
  async assign(scope: RequestScope, id: string, dto: AssignWifiDto) {
    const branchId = requireActiveBranch(scope);
    const cred = await this.getById(scope, id);
    if (cred.used) throw new ConflictError('La credencial ya fue usada');
    const stay = await prisma.stay.findUnique({
      where: { id: dto.stayId },
      include: { room: { select: { number: true } }, guest: { select: { firstName: true, lastName: true } } },
    });
    if (!stay || stay.branchId !== branchId) throw new NotFoundError('Estancia no encontrada');
    if (stay.status !== 'OPEN') throw new ConflictError('La estancia no está activa');
    const guest = `${stay.guest?.firstName ?? ''} ${stay.guest?.lastName ?? ''}`.trim();
    return prisma.$transaction(async (tx) => {
      // Libera cualquier credencial no usada previamente asignada a esta estancia (reemplazo).
      await tx.wifiCredential.updateMany({
        where: { branchId, assignedStayId: stay.id, used: false, id: { not: id } },
        data: { assignedStayId: null, assignedRoom: null, assignedGuest: null, assignedAt: null },
      });
      return tx.wifiCredential.update({
        where: { id },
        data: { assignedStayId: stay.id, assignedRoom: stay.room?.number ?? null, assignedGuest: guest || null, assignedAt: new Date() },
      });
    });
  },

  /** Al checkout: la credencial asignada a la estancia se consume ("Usada"). */
  async releaseByStay(stayId: string) {
    await prisma.wifiCredential.updateMany({
      where: { assignedStayId: stayId, used: false },
      data: { used: true },
    });
  },

  /**
   * Auto-asigna una credencial DISPONIBLE de la categoría a una estancia (usado en el check-in y en
   * la rotación diaria de pernoctación). Devuelve la credencial asignada, o null si el pool está vacío.
   */
  async assignAvailableToStay(branchId: string, stayId: string, category: string, room: string | null, guest: string | null) {
    const cred = await prisma.wifiCredential.findFirst({
      where: { branchId, category, used: false, assignedStayId: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!cred) return null;
    return prisma.wifiCredential.update({
      where: { id: cred.id },
      data: { assignedStayId: stayId, assignedRoom: room, assignedGuest: guest, assignedAt: new Date() },
    });
  },

  /** Datos para imprimir el ticket WiFi de una credencial (identidad de la sucursal + estancia). */
  async ticketData(scope: RequestScope, id: string) {
    const branchId = requireActiveBranch(scope);
    const cred = await this.getById(scope, id);
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { name: true, address: true, landline: true, mobile: true, whatsapp: true, logoUrl: true },
    });
    let stay: { room: string | null; rateLabel: string | null; adults: number; checkOutAt: Date | null } | null = null;
    if (cred.assignedStayId) {
      const s = await prisma.stay.findUnique({
        where: { id: cred.assignedStayId },
        include: { room: { select: { number: true } }, rate: { select: { label: true } } },
      });
      if (s) stay = { room: s.room?.number ?? cred.assignedRoom, rateLabel: s.rate?.label ?? 'Tarifa personalizada', adults: s.adults, checkOutAt: s.plannedCheckoutAt };
    }
    return {
      branch: {
        name: branch?.name ?? '', address: branch?.address ?? '',
        phone: branch?.landline || branch?.mobile || branch?.whatsapp || '', logoUrl: branch?.logoUrl ?? null,
      },
      credential: { ssid: cred.ssid, code: cred.code, category: cred.category, message: cred.message, validMinutes: cred.validMinutes },
      stay: stay ?? { room: cred.assignedRoom, rateLabel: null, adults: 0, checkOutAt: null },
    };
  },

  /**
   * Importa el CSV nativo de Omada en la categoría indicada (la de la pestaña activa). El identificador
   * es el `voucher` (columna Code). Ignora columnas no usadas, salta duplicados (voucher ya existente en
   * RIZZOS o repetido en el archivo) y marca inválidas las filas sin voucher. Con `preview` solo valida.
   */
  async importRows(scope: RequestScope, dto: ImportWifiDto) {
    const branchId = requireActiveBranch(scope);
    const category = (WIFI_CATEGORIES as readonly string[]).includes(dto.category) ? dto.category : 'PERNOCTACION';
    const defaultSsid = (await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }))?.name ?? 'RIZZOS HOSPEDAJE';

    const detected = dto.rows.length;
    const seen = new Set<string>();
    const valid: { ssid: string; voucher: string; validMinutes: number | null; message: string | null }[] = [];
    let invalid = 0;
    let dupInFile = 0;
    for (const r of dto.rows) {
      const voucher = (r.voucher || '').trim();
      if (!voucher) { invalid++; continue; }
      if (seen.has(voucher)) { dupInFile++; continue; }
      seen.add(voucher);
      valid.push({
        ssid: (r.ssid || '').trim() || defaultSsid,
        voucher,
        validMinutes: category === 'GRATIS' ? (r.validMinutes ?? 60) : null,
        message: category === 'GRATIS' ? (r.message?.trim() || null) : null,
      });
    }
    // Duplicados contra la BD (voucher/Code ya registrado en la sucursal, en cualquier categoría).
    const existing = valid.length
      ? new Set(
          (await prisma.wifiCredential.findMany({ where: { branchId, code: { in: valid.map((v) => v.voucher) } }, select: { code: true } }))
            .map((r) => r.code).filter((x): x is string => !!x),
        )
      : new Set<string>();
    const toInsert = valid.filter((v) => !existing.has(v.voucher));
    const duplicates = dupInFile + (valid.length - toInsert.length);
    const summary = { detected, new: toInsert.length, duplicates, invalid };

    if (dto.preview) return { ...summary, created: 0 };
    if (!toInsert.length) return { ...summary, created: 0 };
    const res = await prisma.wifiCredential.createMany({
      data: toInsert.map((v) => ({
        branchId, ssid: v.ssid, password: v.voucher, code: v.voucher, voucher: v.voucher, category,
        validMinutes: v.validMinutes, message: v.message,
      })),
    });
    return { ...summary, created: res.count };
  },
};
