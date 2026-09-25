import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { ForbiddenError } from '../../shared/errors';
import { prisma } from '../../config/prisma';

/**
 * Regla de bloqueo de tarifa personalizada (por sucursal). Controla si Recepción puede usar la
 * tarifa personalizada en el check-in (check-in sin `rateId`). Config en Setting JSON `ops.customRateBlock`.
 * NO modifica precios, duraciones ni tipos: solo permite/bloquea el uso de la personalizada.
 */
const KEY = 'ops.customRateBlock';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleSchema = z.object({
  startDay: z.coerce.number().int().min(1).max(7),
  startTime: z.string().regex(HHMM),
  endDay: z.coerce.number().int().min(1).max(7),
  endTime: z.string().regex(HHMM),
});
const typeRuleSchema = z.object({ availability: z.boolean().default(false), schedules: z.array(scheduleSchema).default([]) });
export const updateCustomRateBlockSchema = z.object({
  enabled: z.boolean(),
  threshold: z.coerce.number().int().min(0).max(999),
  registerReasonAuto: z.boolean(),
  allowAdminException: z.boolean(),
  types: z.record(typeRuleSchema).default({}),
});
export type UpdateCustomRateBlockDto = z.infer<typeof updateCustomRateBlockSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
type Config = z.infer<typeof updateCustomRateBlockSchema>;

const DEFAULT: Config = { enabled: false, threshold: 7, registerReasonAuto: true, allowAdminException: false, types: {} };

function toMin(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function isoDay(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay(); }
/** ¿`now` cae dentro del intervalo semanal [inicio, fin)? Soporta cruces de medianoche y de fin de semana. */
export function withinWeeklyInterval(now: Date, s: Schedule): boolean {
  const wmin = (day: number, t: string) => (day - 1) * 1440 + toMin(t);
  const nowW = (isoDay(now) - 1) * 1440 + now.getHours() * 60 + now.getMinutes();
  const ws = wmin(s.startDay, s.startTime);
  const we = wmin(s.endDay, s.endTime);
  if (we === ws) return false; // intervalo vacío
  return we > ws ? nowW >= ws && nowW < we : nowW >= ws || nowW < we; // el segundo caso cruza el fin de semana
}

async function readConfig(branchId: string): Promise<Config> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: KEY } } });
  if (!s?.value) return { ...DEFAULT };
  const parsed = updateCustomRateBlockSchema.safeParse(JSON.parse(s.value));
  return parsed.success ? parsed.data : { ...DEFAULT };
}

function isAdminScope(scope: RequestScope): boolean {
  return scope.isSuperAdmin || scope.permissions.includes('settings:edit');
}

export const customRateBlockService = {
  /** Config + tipos de habitación (fusionados) + total/disponibles en vivo (para la pantalla). */
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [cfg, roomTypes, total, availableNow] = await Promise.all([
      readConfig(branchId),
      prisma.roomType.findMany({ where: { branchId, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.room.count({ where: { branchId } }),
      prisma.room.count({ where: { branchId, status: 'FREE' } }),
    ]);
    const types = roomTypes.map((t) => ({
      id: t.id, name: t.name,
      availability: cfg.types[t.id]?.availability ?? false,
      schedules: cfg.types[t.id]?.schedules ?? [],
    }));
    return { enabled: cfg.enabled, threshold: cfg.threshold, registerReasonAuto: cfg.registerReasonAuto, allowAdminException: cfg.allowAdminException, total, availableNow, types };
  },

  async update(scope: RequestScope, dto: UpdateCustomRateBlockDto) {
    const branchId = requireActiveBranch(scope);
    if (!isAdminScope(scope)) throw new ForbiddenError('Solo un administrador puede configurar la regla de tarifa personalizada.');
    // Limpia tipos que no pertenezcan a la sucursal (evita basura).
    const valid = new Set((await prisma.roomType.findMany({ where: { branchId }, select: { id: true } })).map((t) => t.id));
    const types: Config['types'] = {};
    for (const [id, rule] of Object.entries(dto.types)) if (valid.has(id)) types[id] = rule;
    const value = JSON.stringify({ ...dto, types });
    await prisma.setting.upsert({ where: { branchId_key: { branchId, key: KEY } }, update: { value }, create: { branchId, key: KEY, value } });
    return this.get(scope);
  },

  /**
   * Decide si un tipo puede usar tarifa personalizada AHORA (orden de evaluación del negocio).
   * Devuelve la razón que la permitió/bloqueó y las banderas relevantes para el check-in.
   */
  async evaluate(branchId: string, roomTypeId: string, now: Date = new Date()) {
    const cfg = await readConfig(branchId);
    const base = { allowAdminException: cfg.allowAdminException, registerReasonAuto: cfg.registerReasonAuto };
    if (!cfg.enabled) return { allowed: true, reason: 'BLOQUEO_OFF' as const, ...base };
    const t = cfg.types[roomTypeId];
    if (t?.schedules?.some((s) => withinWeeklyInterval(now, s))) return { allowed: true, reason: 'HORARIO' as const, ...base };
    if (t?.availability) {
      const availableNow = await prisma.room.count({ where: { branchId, status: 'FREE' } });
      if (availableNow <= cfg.threshold) return { allowed: true, reason: 'DISPONIBILIDAD' as const, availableNow, threshold: cfg.threshold, ...base };
    }
    return { allowed: false, reason: 'BLOQUEADO' as const, ...base };
  },
};
