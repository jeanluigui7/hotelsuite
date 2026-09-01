import type { RequestScope } from '../../shared/context';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { WIFI_CATEGORIES, type CreateWifiDto, type UpdateWifiDto, type BulkCreateWifiDto, type AssignWifiDto } from './wifi.schema';

/** Código corto imprimible (evita 0/O/1/I para leerlo bien en el ticket). */
function genCode(): string {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

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

function serialize(c: WifiRow) {
  return {
    id: c.id, ssid: c.ssid, password: c.password, code: c.code, category: c.category,
    used: c.used, state: stateOf(c), room: c.assignedRoom, guest: c.assignedGuest,
    validMinutes: c.validMinutes, message: c.message,
  };
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
    return rows.map((c) => serialize(c as WifiRow));
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
    return prisma.wifiCredential.create({
      data: {
        branchId, ssid: dto.ssid, password: dto.password, category: dto.category,
        code: dto.code?.trim() || genCode(), voucher: dto.voucher || null, note: dto.note || null,
        validMinutes: dto.category === 'GRATIS' ? dto.validMinutes ?? 60 : null,
        message: dto.category === 'GRATIS' ? dto.message || null : null,
      },
    });
  },

  /** Crea varias credenciales de una categoría con sus contraseñas. */
  async createBulk(scope: RequestScope, dto: BulkCreateWifiDto) {
    const branchId = requireActiveBranch(scope);
    const data = dto.passwords
      .map((p, i) => ({ password: p.trim(), code: (dto.codes?.[i] || '').trim() || genCode() }))
      .filter((x) => x.password)
      .map((x) => ({
        branchId, ssid: dto.ssid, password: x.password, code: x.code, category: dto.category,
        validMinutes: dto.category === 'GRATIS' ? dto.validMinutes ?? 60 : null,
        message: dto.category === 'GRATIS' ? dto.message || null : null,
      }));
    if (!data.length) throw new ValidationError('Ingresa al menos una contraseña');
    const res = await prisma.wifiCredential.createMany({ data });
    return { created: res.count };
  },

  async update(scope: RequestScope, id: string, dto: UpdateWifiDto) {
    await this.getById(scope, id);
    return prisma.wifiCredential.update({
      where: { id },
      data: {
        ...(dto.ssid !== undefined ? { ssid: dto.ssid } : {}),
        ...(dto.password !== undefined ? { password: dto.password } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim() || null } : {}),
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

  /** Importación masiva: filas {ssid, password, code?, category?}. Genera código si falta. */
  async importRows(scope: RequestScope, rows: { ssid: string; password: string; code?: string; category?: string }[]) {
    const branchId = requireActiveBranch(scope);
    const data = rows
      .map((r) => ({ ssid: (r.ssid || '').trim(), password: (r.password || '').trim(), code: (r.code || '').trim(), category: (r.category || '').trim().toUpperCase() }))
      .filter((r) => r.ssid && r.password)
      .map((r) => ({
        branchId, ssid: r.ssid, password: r.password, code: r.code || genCode(),
        category: (WIFI_CATEGORIES as readonly string[]).includes(r.category) ? r.category : 'PERNOCTACION',
      }));
    if (!data.length) throw new ValidationError('El archivo no tiene filas válidas (ssid y password requeridos).');
    const res = await prisma.wifiCredential.createMany({ data });
    return { created: res.count };
  },
};
