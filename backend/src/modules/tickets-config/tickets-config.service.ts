import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/**
 * Configuración de Tickets por sucursal (Configuración → Tickets). Se guarda en la tabla
 * Setting (clave/valor) bajo el prefijo `tickets.*`. NO almacena identidad del hotel (viene de
 * Configuración → Hotel) ni credenciales WiFi (vienen del módulo WiFi): Visualización solo
 * decide si esos datos se muestran.
 *  - tickets.visual        : qué elementos se muestran u ocultan en el ticket.
 *  - tickets.messages      : textos adicionales (bienvenida, pie, legal, etc.).
 *  - tickets.print         : configuración de impresión física (QZ Tray).
 *  - tickets.automations   : reglas de cuándo se imprime o se usa otro canal.
 */
const KEYS = {
  visual: 'tickets.visual',
  messages: 'tickets.messages',
  print: 'tickets.print',
  automations: 'tickets.automations',
};

// ── Esquemas de cada sección ──
const visualSchema = z.object({
  logo: z.boolean(), tradeName: z.boolean(), legalName: z.boolean(), ruc: z.boolean(),
  address: z.boolean(), phone: z.boolean(), room: z.boolean(), guest: z.boolean(),
  datetime: z.boolean(), stayType: z.boolean(), paymentMethod: z.boolean(), amounts: z.boolean(),
  products: z.boolean(), user: z.boolean(), wifi: z.boolean(), qr: z.boolean(), loyalty: z.boolean(),
});
const messagesSchema = z.object({
  welcome: z.string().max(500), farewell: z.string().max(500), guestNotes: z.string().max(500),
  notices: z.string().max(500), legal: z.string().max(500), footer: z.string().max(500),
});
const printSchema = z.object({
  paper: z.enum(['58', '80']), copies: z.coerce.number().int().min(1).max(5),
  autocut: z.boolean(), defaultPrinter: z.string().max(160),
});
const channel = z.enum(['PRINT', 'WHATSAPP', 'NONE']);
const ruleSchema = z.object({ enabled: z.boolean(), channel });
const automationsSchema = z.object({
  checkin: ruleSchema, pendingChange: ruleSchema, cashClose: ruleSchema,
  productTransfer: ruleSchema, cleaningClose: ruleSchema,
});

export const updateTicketsConfigSchema = z.object({
  visual: visualSchema.partial().optional(),
  messages: messagesSchema.partial().optional(),
  print: printSchema.partial().optional(),
  automations: automationsSchema.partial().optional(),
});
export type UpdateTicketsConfigDto = z.infer<typeof updateTicketsConfigSchema>;

// ── Defaults (sucursal sin config) ──
const DEFAULTS = {
  visual: {
    logo: true, tradeName: true, legalName: false, ruc: true, address: true, phone: true,
    room: true, guest: true, datetime: true, stayType: true, paymentMethod: true, amounts: true,
    products: true, user: true, wifi: false, qr: false, loyalty: false,
  },
  messages: { welcome: '', farewell: '', guestNotes: '', notices: '', legal: '', footer: '' },
  print: { paper: '80' as const, copies: 1, autocut: true, defaultPrinter: '' },
  automations: {
    checkin: { enabled: false, channel: 'NONE' as const },
    pendingChange: { enabled: false, channel: 'NONE' as const },
    cashClose: { enabled: false, channel: 'NONE' as const },
    productTransfer: { enabled: false, channel: 'NONE' as const },
    cleaningClose: { enabled: false, channel: 'NONE' as const },
  },
};

async function read(branchId: string, key: string): Promise<unknown | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}
async function write(branchId: string, key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { branchId_key: { branchId, key } }, update: { value: v }, create: { branchId, key, value: v } });
}
/** Mezcla los defaults con lo guardado (para tolerar claves nuevas). */
function merge<T>(def: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return def;
  return { ...def, ...(saved as object) } as T;
}
function mergeAutomations(saved: unknown): typeof DEFAULTS.automations {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS.automations };
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    out[k] = merge(DEFAULTS.automations[k], s[k]);
  }
  return out;
}

export const ticketsConfigService = {
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [visual, messages, print, automations] = await Promise.all([
      read(branchId, KEYS.visual), read(branchId, KEYS.messages), read(branchId, KEYS.print), read(branchId, KEYS.automations),
    ]);
    return {
      visual: merge(DEFAULTS.visual, visual),
      messages: merge(DEFAULTS.messages, messages),
      print: merge(DEFAULTS.print, print),
      automations: mergeAutomations(automations),
    };
  },

  async update(scope: RequestScope, dto: UpdateTicketsConfigDto) {
    const branchId = requireActiveBranch(scope);
    const current = await this.get(scope);
    if (dto.visual) await write(branchId, KEYS.visual, { ...current.visual, ...dto.visual });
    if (dto.messages) await write(branchId, KEYS.messages, { ...current.messages, ...dto.messages });
    if (dto.print) await write(branchId, KEYS.print, { ...current.print, ...dto.print });
    if (dto.automations) {
      const merged = { ...current.automations };
      for (const [k, v] of Object.entries(dto.automations)) {
        (merged as Record<string, unknown>)[k] = { ...(merged as Record<string, unknown>)[k] as object, ...(v as object) };
      }
      await write(branchId, KEYS.automations, merged);
    }
    return this.get(scope);
  },
};
