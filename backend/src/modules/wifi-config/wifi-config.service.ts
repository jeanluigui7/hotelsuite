import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/**
 * Configuración WiFi por sucursal: MODO de entrega de la credencial del huésped.
 * WiFi es la FUENTE; WhatsApp y Tickets consumen esta credencial.
 * Guardado como JSON en Setting (key `wifi.config`).
 * Modos internos (NO submenús): GLOBAL | TARIFA | TIPO | POOL | NONE.
 * La LÓGICA DE ASIGNACIÓN por tarifa/tipo/pool se implementará después; aquí solo el modo
 * y la credencial global (para el modo GLOBAL).
 */
const KEY = 'wifi.config';

export const WIFI_MODES = ['GLOBAL', 'TARIFA', 'TIPO', 'POOL', 'NONE'] as const;

export const wifiConfigSchema = z.object({
  mode: z.enum(WIFI_MODES).optional(),
  globalSsid: z.string().max(120).optional(),
  globalPassword: z.string().max(120).optional(),
});
export type WifiConfigDto = z.infer<typeof wifiConfigSchema>;

function defaults() {
  return { mode: 'GLOBAL' as (typeof WIFI_MODES)[number], globalSsid: '', globalPassword: '' };
}

export const wifiConfigService = {
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: KEY } } });
    const base = defaults();
    if (!s?.value) return base;
    try {
      return { ...base, ...JSON.parse(s.value) };
    } catch {
      return base;
    }
  },

  async update(scope: RequestScope, dto: WifiConfigDto) {
    const branchId = requireActiveBranch(scope);
    const current = await this.get(scope);
    const merged = {
      mode: dto.mode ?? current.mode,
      globalSsid: dto.globalSsid ?? current.globalSsid,
      globalPassword: dto.globalPassword ?? current.globalPassword,
    };
    await prisma.setting.upsert({
      where: { branchId_key: { branchId, key: KEY } },
      update: { value: JSON.stringify(merged) },
      create: { branchId, key: KEY, value: JSON.stringify(merged) },
    });
    return this.get(scope);
  },
};
