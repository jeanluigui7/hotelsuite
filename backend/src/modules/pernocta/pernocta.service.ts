import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/**
 * RIZZOS — Día hotelero (pernocta). El día hotelero NO es 24h: tiene horario fijo
 * (check-in desde la hora X, check-out hasta la hora Y del día siguiente). El ingreso
 * antes de la hora de check-in genera cargo de "early check-in"; la salida después de
 * la hora de check-out genera cargo de "late check-out". Tarifas configurables por sucursal.
 */
const KEYS = {
  checkInHour: 'pernocta.checkInHour', // hora de check-in hotelero (0-23), def. 13
  checkOutHour: 'pernocta.checkOutHour', // hora de check-out hotelero (0-23), def. 12
  earlyRatePerHour: 'pernocta.earlyRatePerHour', // S/ por hora anticipada
  lateRatePerHour: 'pernocta.lateRatePerHour', // S/ por hora de salida tardía
} as const;

export const updatePernoctaSchema = z.object({
  checkInHour: z.coerce.number().int().min(0).max(23).optional(),
  checkOutHour: z.coerce.number().int().min(0).max(23).optional(),
  earlyRatePerHour: z.coerce.number().min(0).optional(),
  lateRatePerHour: z.coerce.number().min(0).optional(),
});
export type UpdatePernoctaDto = z.infer<typeof updatePernoctaSchema>;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function read(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}
async function write(branchId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { branchId_key: { branchId, key } },
    update: { value },
    create: { branchId, key, value },
  });
}

export interface PernoctaConfig {
  checkInHour: number;
  checkOutHour: number;
  earlyRatePerHour: number;
  lateRatePerHour: number;
}

export const pernoctaService = {
  async get(scope: RequestScope): Promise<PernoctaConfig> {
    const branchId = requireActiveBranch(scope);
    const [ci, co, early, late] = await Promise.all([
      read(branchId, KEYS.checkInHour),
      read(branchId, KEYS.checkOutHour),
      read(branchId, KEYS.earlyRatePerHour),
      read(branchId, KEYS.lateRatePerHour),
    ]);
    return {
      checkInHour: ci != null ? Number(ci) : 13,
      checkOutHour: co != null ? Number(co) : 12,
      earlyRatePerHour: early != null ? Number(early) : 0,
      lateRatePerHour: late != null ? Number(late) : 0,
    };
  },

  async update(scope: RequestScope, dto: UpdatePernoctaDto): Promise<PernoctaConfig> {
    const branchId = requireActiveBranch(scope);
    if (dto.checkInHour !== undefined) await write(branchId, KEYS.checkInHour, String(dto.checkInHour));
    if (dto.checkOutHour !== undefined) await write(branchId, KEYS.checkOutHour, String(dto.checkOutHour));
    if (dto.earlyRatePerHour !== undefined) await write(branchId, KEYS.earlyRatePerHour, String(dto.earlyRatePerHour));
    if (dto.lateRatePerHour !== undefined) await write(branchId, KEYS.lateRatePerHour, String(dto.lateRatePerHour));
    return this.get(scope);
  },

  /**
   * Cotiza el día hotelero para un check-in: salida prevista (horario fijo) + cargo de
   * early check-in si ingresa antes de la hora oficial. `nights` = noches hoteleras (def. 1).
   */
  async quoteCheckIn(scope: RequestScope, checkInAt: Date, nights = 1): Promise<{
    plannedCheckoutAt: Date;
    earlyHours: number;
    earlyCharge: number;
    config: PernoctaConfig;
  }> {
    const cfg = await this.get(scope);
    const ci = new Date(checkInAt);
    // Regla de corte de pernoctación: si ingresa HASTA la hora de corte, la estadía vence
    // ese mismo día a la hora de corte; si ingresa DESPUÉS del corte, vence al día siguiente.
    // Cada noche adicional suma un día. La hora de corte es por sucursal (pernocta.checkOutHour).
    const tod = ci.getHours() + ci.getMinutes() / 60;
    const baseDayOffset = tod <= cfg.checkOutHour ? 0 : 1;
    const planned = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate() + baseDayOffset + (nights - 1), cfg.checkOutHour, 0, 0, 0);
    // Early check-in: horas (o fracción → se redondea hacia arriba) antes de la hora oficial.
    const earlyHours = tod < cfg.checkInHour ? Math.ceil(cfg.checkInHour - tod) : 0;
    const earlyCharge = round(earlyHours * cfg.earlyRatePerHour);
    return { plannedCheckoutAt: planned, earlyHours, earlyCharge, config: cfg };
  },

  /** Cotiza la salida tardía (late check-out) comparando la salida real con la prevista. */
  async quoteCheckOut(scope: RequestScope, plannedCheckoutAt: Date, actualCheckOutAt: Date): Promise<{
    lateHours: number;
    lateCharge: number;
  }> {
    const cfg = await this.get(scope);
    const diffMs = new Date(actualCheckOutAt).getTime() - new Date(plannedCheckoutAt).getTime();
    const lateHours = diffMs > 0 ? Math.ceil(diffMs / 3_600_000) : 0;
    return { lateHours, lateCharge: round(lateHours * cfg.lateRatePerHour) };
  },
};
