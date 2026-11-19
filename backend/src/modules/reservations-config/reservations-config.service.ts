import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { recordActivity } from '../activity-log/activity.emitter';

/**
 * Configuración del módulo Reservas por sucursal (una sola pantalla: /settings/reservas).
 * Se persiste como un único Setting JSON (clave `reservas.config`), siguiendo el patrón de
 * `operations-config` (campo `pos`). La ETAPA 4B la usa para sembrar los defaults de política,
 * plazos y adelanto al crear una reserva (congelándolos en la reserva).
 */
const KEY = 'reservas.config';

const promoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(['FIJO', 'PORCENTAJE', 'TIEMPO']),
  valor: z.coerce.number(),
  desde: z.string(),
  hasta: z.string(),
  tarifas: z.string(),
  condicionPago: z.string(),
  compatible: z.boolean(),
});

const policySchema = z.object({
  id: z.string(),
  nombre: z.string(),
  version: z.string(),
  ambito: z.enum(['RESERVA', 'ESTADIA']),
  vigenciaDesde: z.string(),
  vigenciaHasta: z.string(),
  textoCliente: z.string(),
  reglas: z.string(),
});

export const reservasConfigSchema = z.object({
  horarios: z.object({
    checkinHora: z.string(),
    checkoutHora: z.string(),
    preparacionMin: z.coerce.number().int().min(0),
    margenMin: z.coerce.number().int().min(0),
  }),
  tentativas: z.object({
    vigenciaHoras: z.coerce.number().min(0),
    recordarHoras: z.coerce.number().min(0),
    autoVencer: z.boolean(),
  }),
  pagos: z.object({
    adelantoPct: z.coerce.number().min(0).max(100),
    plazoPagoHoras: z.coerce.number().min(0),
    permitirParcial: z.boolean(),
    mediosPermitidos: z.array(z.string()),
  }),
  cancelacion: z.object({
    textoCancelacion: z.string(),
    penalidadPct: z.coerce.number().min(0).max(100),
    ventanaSinPenalidadHoras: z.coerce.number().min(0),
    noShowPenalidadPct: z.coerce.number().min(0).max(100),
    textoNoShow: z.string(),
  }),
  documentos: z.object({
    mostrarLogo: z.boolean(),
    formatoDefecto: z.enum(['A4', 'TICKET']),
    textoLegal: z.string(),
    pie: z.string(),
  }),
  promociones: z.array(promoSchema),
  politicas: z.array(policySchema),
});
export type ReservasConfigDto = z.infer<typeof reservasConfigSchema>;

export const DEFAULT_RESERVAS_CONFIG: ReservasConfigDto = {
  horarios: { checkinHora: '14:00', checkoutHora: '12:00', preparacionMin: 60, margenMin: 0 },
  tentativas: { vigenciaHoras: 24, recordarHoras: 3, autoVencer: false },
  pagos: { adelantoPct: 0, plazoPagoHoras: 48, permitirParcial: true, mediosPermitidos: ['CASH', 'CARD', 'TRANSFER'] },
  cancelacion: { textoCancelacion: '', penalidadPct: 0, ventanaSinPenalidadHoras: 24, noShowPenalidadPct: 0, textoNoShow: '' },
  documentos: { mostrarLogo: true, formatoDefecto: 'A4', textoLegal: '', pie: '' },
  promociones: [],
  politicas: [],
};

async function read(branchId: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: KEY } } });
  return s?.value ?? null;
}

/** Mezcla la config guardada sobre los defaults (tolerante a claves nuevas agregadas luego). */
function mergeWithDefaults(raw: string | null): ReservasConfigDto {
  if (!raw) return DEFAULT_RESERVAS_CONFIG;
  try {
    const parsed = reservasConfigSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    // Guardado parcial o de una versión previa: completar con defaults por sección.
    const obj = JSON.parse(raw) as Partial<ReservasConfigDto>;
    const d = DEFAULT_RESERVAS_CONFIG;
    return {
      horarios: { ...d.horarios, ...(obj.horarios ?? {}) },
      tentativas: { ...d.tentativas, ...(obj.tentativas ?? {}) },
      pagos: { ...d.pagos, ...(obj.pagos ?? {}) },
      cancelacion: { ...d.cancelacion, ...(obj.cancelacion ?? {}) },
      documentos: { ...d.documentos, ...(obj.documentos ?? {}) },
      promociones: Array.isArray(obj.promociones) ? obj.promociones : d.promociones,
      politicas: Array.isArray(obj.politicas) ? obj.politicas : d.politicas,
    };
  } catch {
    return DEFAULT_RESERVAS_CONFIG;
  }
}

export const reservationsConfigService = {
  async get(scope: RequestScope): Promise<ReservasConfigDto> {
    const branchId = requireActiveBranch(scope);
    return mergeWithDefaults(await read(branchId));
  },

  /** Lectura interna por branchId (para sembrar defaults al crear una reserva — ETAPA 4B). */
  async getForBranch(branchId: string): Promise<ReservasConfigDto> {
    return mergeWithDefaults(await read(branchId));
  },

  async update(scope: RequestScope, dto: ReservasConfigDto): Promise<ReservasConfigDto> {
    const branchId = requireActiveBranch(scope);
    const value = JSON.stringify(dto);
    await prisma.setting.upsert({
      where: { branchId_key: { branchId, key: KEY } },
      update: { value },
      create: { branchId, key: KEY, value },
    });
    void recordActivity(scope, {
      activity: 'SETTINGS_UPDATE', area: 'RESERVAS', reference: 'Configuración de Reservas',
      detail: `Config de reservas actualizada · ${dto.politicas.length} política(s), ${dto.promociones.length} promo(s)`,
      meta: { key: KEY, policies: dto.politicas.length, promos: dto.promociones.length },
    });
    return dto;
  },
};
