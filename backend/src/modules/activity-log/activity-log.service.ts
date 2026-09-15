import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { RequestScope } from '../../shared/context';
import { ForbiddenError } from '../../shared/errors';
import { prisma } from '../../config/prisma';

/** Query de la bitácora de auditoría: filtros + paginación con "Todos" (pageSize 0). */
export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(0).max(5000).default(100), // 0 = todos los filtrados (tope 5000)
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().optional(),
  branch: z.string().optional(), // 'all' o un id de sucursal (param propio, no choca con ?branchId del tenant)
  userId: z.string().optional(),
  area: z.string().optional(),
  activity: z.string().optional(),
  reference: z.string().optional(), // busca por habitación/referencia (contains)
  shift: z.string().optional(),
  dateFrom: z.string().optional(), // ISO
  dateTo: z.string().optional(), // ISO
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const activityLogService = {
  async list(scope: RequestScope, q: ActivityQuery) {
    // Solo eventos de dominio (el log HTTP legacy tiene activity NULL y se oculta de la vista).
    const where: Prisma.ActivityLogWhereInput = { activity: { not: null } };

    // RBAC de sucursal: el Super Admin ve todas o una específica; los demás solo sus sucursales.
    const allowed = scope.branchIds;
    if (q.branch && q.branch !== 'all') {
      if (!scope.isSuperAdmin && !allowed.includes(q.branch)) {
        throw new ForbiddenError('No tienes acceso a las actividades de esa sucursal.');
      }
      where.branchId = q.branch;
    } else if (!scope.isSuperAdmin) {
      where.branchId = { in: allowed.length ? allowed : ['__none__'] };
    }

    if (q.userId) where.userId = q.userId;
    if (q.area) where.area = q.area;
    if (q.activity) where.activity = q.activity;
    if (q.shift) where.shift = q.shift;
    if (q.reference) where.reference = { contains: q.reference };
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }
    if (q.search) {
      where.OR = [
        { reference: { contains: q.search } },
        { detail: { contains: q.search } },
        { activity: { contains: q.search } },
        { userEmail: { contains: q.search } },
        { metaJson: { contains: q.search } },
      ];
    }

    const orderBy: Prisma.ActivityLogOrderByWithRelationInput = { createdAt: q.sortDir };
    const take = q.pageSize > 0 ? q.pageSize : 5000; // "Todos": tope de seguridad
    const skip = q.pageSize > 0 ? (q.page - 1) * q.pageSize : 0;

    const [rows, total] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy, skip, take }),
      prisma.activityLog.count({ where }),
    ]);

    // Resolver nombres (usuario ejecutor, autorizador, sucursal) para la vista.
    const userIds = [...new Set(rows.flatMap((r) => [r.userId, r.authorizedByUserId]).filter((x): x is string => !!x))];
    const branchIds = [...new Set(rows.map((r) => r.branchId).filter((x): x is string => !!x))];
    const [users, branches] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
      branchIds.length ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.name || u.email]));
    const bMap = new Map(branches.map((b) => [b.id, b.name]));

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      activity: r.activity,
      area: r.area,
      reference: r.reference,
      detail: r.detail,
      shift: r.shift,
      roomId: r.roomId,
      entityId: r.entityId,
      userId: r.userId,
      userName: r.userId ? (uMap.get(r.userId) ?? r.userEmail ?? null) : (r.userEmail ?? null),
      authorizedByName: r.authorizedByUserId ? (uMap.get(r.authorizedByUserId) ?? null) : null,
      branchId: r.branchId,
      branchName: r.branchId ? (bMap.get(r.branchId) ?? null) : null,
      meta: r.metaJson ? safeParse(r.metaJson) : null,
    }));

    return { items, meta: { page: q.page, pageSize: q.pageSize, total } };
  },
};

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
