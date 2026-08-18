import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/**
 * Configuración de Mensajes de WhatsApp por sucursal (mensaje de bienvenida + notificaciones internas).
 * Se guarda como un único JSON en la tabla Setting (key `whatsapp.config`).
 * El MODO de WiFi NO vive aquí: es del módulo WiFi (fuente); aquí solo `showWifi` (incluirlo o no).
 */
const KEY = 'whatsapp.config';

export const DEFAULT_WELCOME_TEMPLATE = `¡Hola {guest_name}! 👋

Has sido aceptado en {hotel_name}. Tu reserva ha sido confirmada exitosamente.

🏨 Habitación: {room_number}
📅 Check-in: {checkin_date}
📅 Check-out: {checkout_date}
💰 Total: {total_price}
💳 Método de pago: {payment_method}

{wifi_info}

¡Que disfrutes tu estadía! 😊`;

/** Variables disponibles para la plantilla (se muestran como chips en el editor). */
export const TEMPLATE_VARIABLES = [
  'guest_name', 'hotel_name', 'room_number', 'checkin_date',
  'checkout_date', 'verification_code', 'wifi_info', 'payment_method', 'total_price',
] as const;

const notifSchema = z.object({
  enabled: z.boolean().default(false),
  numbers: z.array(z.string().max(20)).default([]),
});

export const whatsappConfigSchema = z.object({
  autoSend: z.boolean().optional(),
  aiAgent: z.boolean().optional(),
  showWifi: z.boolean().optional(),
  welcomeTemplate: z.string().max(4000).optional(),
  notifications: z
    .object({
      reception: notifSchema.optional(),
      productRequest: notifSchema.optional(),
      productWriteoff: notifSchema.optional(),
      maintenance: notifSchema.optional(),
    })
    .optional(),
});
export type WhatsappConfigDto = z.infer<typeof whatsappConfigSchema>;

function defaults() {
  return {
    autoSend: true,
    aiAgent: false,
    showWifi: true,
    welcomeTemplate: DEFAULT_WELCOME_TEMPLATE,
    notifications: {
      reception: { enabled: false, numbers: [] as string[] },
      productRequest: { enabled: false, numbers: [] as string[] },
      productWriteoff: { enabled: false, numbers: [] as string[] },
      maintenance: { enabled: false, numbers: [] as string[] },
    },
    variables: TEMPLATE_VARIABLES,
    defaultTemplate: DEFAULT_WELCOME_TEMPLATE,
  };
}

export const whatsappConfigService = {
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: KEY } } });
    const base = defaults();
    if (!s?.value) return base;
    try {
      const saved = JSON.parse(s.value);
      return {
        ...base,
        ...saved,
        notifications: { ...base.notifications, ...(saved.notifications ?? {}) },
        variables: TEMPLATE_VARIABLES,
        defaultTemplate: DEFAULT_WELCOME_TEMPLATE,
      };
    } catch {
      return base;
    }
  },

  async update(scope: RequestScope, dto: WhatsappConfigDto) {
    const branchId = requireActiveBranch(scope);
    const current = await this.get(scope);
    const merged = {
      autoSend: dto.autoSend ?? current.autoSend,
      aiAgent: dto.aiAgent ?? current.aiAgent,
      showWifi: dto.showWifi ?? current.showWifi,
      welcomeTemplate: dto.welcomeTemplate ?? current.welcomeTemplate,
      notifications: { ...current.notifications, ...(dto.notifications ?? {}) },
    };
    await prisma.setting.upsert({
      where: { branchId_key: { branchId, key: KEY } },
      update: { value: JSON.stringify(merged) },
      create: { branchId, key: KEY, value: JSON.stringify(merged) },
    });
    return this.get(scope);
  },
};
