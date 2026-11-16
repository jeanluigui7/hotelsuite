import type { Maintenance, Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { pageMeta, toPrismaPaging, type PaginationParams } from '../../shared/pagination';
import { requireActiveBranch } from '../../shared/scope';
import { requireCleaningShiftIfCleaner } from '../../shared/cleaning-shift';
import { prisma } from '../../config/prisma';
import { maintenanceRepository } from './maintenance.repository';
import { recordActivity } from '../activity-log/activity.emitter';
import type { CreateMaintenanceDto, ReportFaultsDto, UpdateMaintenanceDto } from './maintenance.schema';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'];

async function roomMap(branchId: string): Promise<Map<string, string>> {
  const rooms = await prisma.room.findMany({ where: { branchId }, select: { id: true, number: true } });
  return new Map(rooms.map((r) => [r.id, r.number]));
}

async function userMap(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function serialize(m: Maintenance, rooms: Map<string, string>, users?: Map<string, string>) {
  return {
    id: m.id,
    roomId: m.roomId,
    roomNumber: m.roomId ? (rooms.get(m.roomId) ?? null) : null,
    title: m.title,
    description: m.description,
    status: m.status,
    cost: m.cost,
    scheduledAt: m.scheduledAt,
    completedAt: m.completedAt,
    createdAt: m.createdAt,
    // Falla reportada
    faultTypeId: m.faultTypeId,
    category: m.category,
    categoryLabel: m.categoryLabel,
    faultLabel: m.faultLabel,
    severity: m.severity,
    photo: m.photo,
    // Reporte / resolución
    createdByUserId: m.createdByUserId,
    reporterName: m.createdByUserId ? (users?.get(m.createdByUserId) ?? null) : null,
    resolvedAt: m.resolvedAt,
    resolvedByUserId: m.resolvedByUserId,
    resolverName: m.resolvedByUserId ? (users?.get(m.resolvedByUserId) ?? null) : null,
    repairedBy: m.repairedBy,
    resolutionNotes: m.resolutionNotes,
    resolutionPhoto: m.resolutionPhoto,
  };
}

async function assertRoom(roomId: string | null | undefined, branchId: string): Promise<void> {
  if (!roomId) return;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.branchId !== branchId) throw new ValidationError('Habitación inválida');
}

/**
 * Recalcula el bloqueo por falla de una habitación: `blocked` = hay ≥1 mantenimiento
 * CRÍTICO abierto. Mantiene el estado operativo coherente (una habitación LIBRE con
 * falla crítica pasa a MANTENIMIENTO; al desbloquear vuelve a limpieza u ocupada).
 */
async function recomputeRoomBlock(roomId: string): Promise<boolean> {
  const openCrit = await prisma.maintenance.count({
    where: { roomId, severity: 'CRITICA', status: { in: OPEN_STATUSES } },
  });
  const blocked = openCrit > 0;
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { status: true, blocked: true } });
  if (!room) return blocked;
  const data: Prisma.RoomUncheckedUpdateInput = {};
  if (room.blocked !== blocked) data.blocked = blocked;
  if (blocked && room.status === 'FREE') data.status = 'MAINTENANCE';
  if (!blocked && room.status === 'MAINTENANCE') {
    const hasStay = await prisma.stay.count({ where: { roomId, status: 'OPEN' } });
    data.status = hasStay ? 'OCCUPIED' : 'CLEANING';
  }
  if (Object.keys(data).length) await prisma.room.update({ where: { id: roomId }, data });
  return blocked;
}

/** Resuelve la falla contra el catálogo (la gravedad del catálogo manda). */
async function resolveFaultSnapshot(input: {
  faultTypeId?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  faultLabel?: string | null;
  severity?: string;
}): Promise<{ faultTypeId: string | null; category: string | null; categoryLabel: string | null; faultLabel: string | null; severity: string }> {
  if (input.faultTypeId) {
    const ft = await prisma.faultType.findUnique({ where: { id: input.faultTypeId } });
    if (ft) {
      return { faultTypeId: ft.id, category: ft.category, categoryLabel: ft.categoryLabel, faultLabel: ft.label, severity: ft.severity };
    }
  }
  return {
    faultTypeId: input.faultTypeId ?? null,
    category: input.category ?? null,
    categoryLabel: input.categoryLabel ?? null,
    faultLabel: input.faultLabel ?? null,
    severity: input.severity ?? 'LEVE',
  };
}

export const maintenanceService = {
  async list(scope: RequestScope, params: PaginationParams, status?: string) {
    const branchId = requireActiveBranch(scope);
    const where: Prisma.MaintenanceWhereInput = { branchId };
    if (status) where.status = status;
    if (params.search) where.title = { contains: params.search };
    const { skip, take } = toPrismaPaging(params);
    const [rows, total] = await Promise.all([
      maintenanceRepository.list({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      maintenanceRepository.count(where),
    ]);
    const rooms = await roomMap(branchId);
    const users = await userMap(rows.flatMap((m) => [m.createdByUserId, m.resolvedByUserId]));
    return { items: rows.map((m) => serialize(m, rooms, users)), meta: pageMeta(params, total) };
  },

  async getEntity(scope: RequestScope, id: string) {
    const m = await maintenanceRepository.findById(id);
    if (!m || m.branchId !== requireActiveBranch(scope)) throw new NotFoundError('Mantenimiento no encontrado');
    return m;
  },

  async get(scope: RequestScope, id: string) {
    const m = await this.getEntity(scope, id);
    const rooms = await roomMap(m.branchId);
    const users = await userMap([m.createdByUserId, m.resolvedByUserId]);
    return serialize(m, rooms, users);
  },

  async create(scope: RequestScope, dto: CreateMaintenanceDto) {
    await requireCleaningShiftIfCleaner(scope);
    const branchId = requireActiveBranch(scope);
    await assertRoom(dto.roomId, branchId);
    const snap = await resolveFaultSnapshot({
      faultTypeId: dto.faultTypeId,
      category: dto.category,
      categoryLabel: dto.categoryLabel,
      faultLabel: dto.faultLabel,
      severity: dto.severity ?? (dto.critical ? 'CRITICA' : 'LEVE'),
    });
    const m = await maintenanceRepository.create({
      branchId,
      roomId: dto.roomId ?? null,
      title: dto.title,
      description: dto.description || null,
      status: dto.status,
      cost: dto.cost ?? null,
      assignedToUserId: dto.assignedToUserId ?? null,
      scheduledAt: dto.scheduledAt ?? null,
      createdByUserId: scope.userId,
      faultTypeId: snap.faultTypeId,
      category: snap.category,
      categoryLabel: snap.categoryLabel,
      faultLabel: snap.faultLabel,
      severity: snap.severity,
      photo: dto.photo ?? null,
    });
    if (dto.roomId && dto.status !== 'DONE' && dto.status !== 'CANCELLED') await recomputeRoomBlock(dto.roomId);
    const rmap = await roomMap(branchId);
    const num = m.roomId ? rmap.get(m.roomId) : null;
    void recordActivity(scope, {
      activity: 'MAINTENANCE', area: 'MANTENIMIENTO', roomId: m.roomId, entityId: m.id,
      reference: num ? `Hab. ${num}` : 'Mantenimiento',
      detail: `${num ? `Hab. ${num} ` : ''}falla reportada · ${m.faultLabel ?? m.title}`,
      meta: { room: num ?? null, title: m.title, severity: m.severity, status: m.status },
    });
    return serialize(m, rmap);
  },

  /**
   * "Reportar falla": crea UN mantenimiento por cada falla (para resolverlas por separado).
   * La gravedad la fija el catálogo (no quien reporta). Recalcula el bloqueo de la habitación.
   */
  async reportFaults(scope: RequestScope, dto: ReportFaultsDto) {
    await requireCleaningShiftIfCleaner(scope);
    const branchId = requireActiveBranch(scope);
    await assertRoom(dto.roomId, branchId);
    const rmap = await roomMap(branchId);
    const num = rmap.get(dto.roomId) ?? null;
    const created: Maintenance[] = [];
    for (const f of dto.fallas) {
      const snap = await resolveFaultSnapshot(f);
      const title = `${snap.faultLabel ?? 'Falla'}${num ? ` · Hab. ${num}` : ''}`.slice(0, 150);
      const m = await maintenanceRepository.create({
        branchId,
        roomId: dto.roomId,
        title,
        description: f.observation || null,
        status: 'OPEN',
        createdByUserId: scope.userId,
        faultTypeId: snap.faultTypeId,
        category: snap.category,
        categoryLabel: snap.categoryLabel,
        faultLabel: snap.faultLabel,
        severity: snap.severity,
        photo: f.photo || null,
      });
      created.push(m);
    }
    const blocked = await recomputeRoomBlock(dto.roomId);
    const crit = created.filter((m) => m.severity === 'CRITICA').length;
    void recordActivity(scope, {
      activity: 'MAINTENANCE', area: 'MANTENIMIENTO', roomId: dto.roomId,
      reference: num ? `Hab. ${num}` : 'Mantenimiento',
      detail: `${num ? `Hab. ${num} ` : ''}${created.length} falla(s) reportada(s)${crit ? ` · ${crit} crítica(s)` : ''}`,
      meta: { room: num ?? null, count: created.length, critical: crit, blocked },
    });
    const room = await prisma.room.findUnique({ where: { id: dto.roomId }, select: { status: true } });
    const users = await userMap(created.map((m) => m.createdByUserId));
    return { items: created.map((m) => serialize(m, rmap, users)), blocked, roomStatus: room?.status ?? null };
  },

  async update(scope: RequestScope, id: string, dto: UpdateMaintenanceDto) {
    const branchId = requireActiveBranch(scope);
    await this.getEntity(scope, id);
    await assertRoom(dto.roomId, branchId);
    const m = await maintenanceRepository.update(id, {
      roomId: dto.roomId === undefined ? undefined : dto.roomId,
      title: dto.title,
      description: dto.description === '' ? null : dto.description,
      status: dto.status,
      cost: dto.cost,
      assignedToUserId: dto.assignedToUserId === undefined ? undefined : dto.assignedToUserId,
      scheduledAt: dto.scheduledAt === undefined ? undefined : dto.scheduledAt,
      completedAt: dto.status === 'DONE' ? new Date() : undefined,
    });
    // Al resolver/anular se recalcula el bloqueo (puede liberar la habitación).
    if ((dto.status === 'DONE' || dto.status === 'CANCELLED') && m.roomId) await recomputeRoomBlock(m.roomId);
    const rmap = await roomMap(branchId);
    const num = m.roomId ? rmap.get(m.roomId) : null;
    const doneMnt = dto.status === 'DONE' || dto.status === 'CANCELLED';
    void recordActivity(scope, {
      activity: 'MAINTENANCE', area: 'MANTENIMIENTO', roomId: m.roomId, entityId: m.id,
      reference: num ? `Hab. ${num}` : 'Mantenimiento',
      detail: doneMnt ? `${num ? `Hab. ${num} ` : ''}disponible nuevamente · ${m.title}` : `${num ? `Hab. ${num} ` : ''}${m.title} · ${m.status}`,
      meta: { room: num ?? null, title: m.title, status: m.status },
    });
    return serialize(m, rmap);
  },

  async remove(scope: RequestScope, id: string) {
    const m = await this.getEntity(scope, id);
    const res = await maintenanceRepository.delete(id);
    if (m.roomId) await recomputeRoomBlock(m.roomId);
    return res;
  },
};
