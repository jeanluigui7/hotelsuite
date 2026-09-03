import { z } from 'zod';

export const WIFI_CATEGORIES = ['PERNOCTACION', 'ESTADIA_CORTA', 'PERSONALIZADA', 'GRATIS'] as const;
const categoryEnum = z.enum(WIFI_CATEGORIES);

// El valor entregado al huésped es el VOUCHER (columna Code de Omada). No existe "contraseña".
export const createWifiSchema = z.object({
  ssid: z.string().min(1).max(120),
  voucher: z.string().min(1).max(120),
  category: categoryEnum.default('PERNOCTACION'),
  note: z.string().max(250).optional().or(z.literal('')),
  validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().max(300).optional().or(z.literal('')),
});

export const updateWifiSchema = z.object({
  ssid: z.string().min(1).max(120).optional(),
  voucher: z.string().min(1).max(120).optional(),
  category: categoryEnum.optional(),
  validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().max(300).optional().or(z.literal('')),
});

/** Crear varias credenciales de una categoría con sus vouchers/cupones. */
export const bulkCreateWifiSchema = z.object({
  ssid: z.string().min(1).max(120),
  category: categoryEnum.default('PERNOCTACION'),
  vouchers: z.array(z.string().min(1).max(120)).min(1).max(100),
  validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().max(300).optional().or(z.literal('')),
});

export const bulkDeleteWifiSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

/**
 * Importación masiva desde el CSV nativo de Omada. La CATEGORÍA la fija la pestaña activa (no el CSV).
 * Cada fila trae al menos el `voucher` (columna Code). GRATIS además usa `message` (Notes) y
 * `validMinutes` (Duration). `preview` = solo validar y devolver el resumen, sin insertar.
 */
export const importWifiSchema = z.object({
  category: categoryEnum.default('PERNOCTACION'),
  preview: z.boolean().optional(),
  rows: z.array(z.object({
    ssid: z.string().max(120).optional().or(z.literal('')),
    voucher: z.string().max(120).optional().or(z.literal('')),
    message: z.string().max(300).optional().or(z.literal('')),
    validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  })).min(1).max(2000),
});

/** Asignar una credencial a la estancia activa de una habitación. */
export const assignWifiSchema = z.object({ stayId: z.string().min(1) });

export type CreateWifiDto = z.infer<typeof createWifiSchema>;
export type UpdateWifiDto = z.infer<typeof updateWifiSchema>;
export type BulkCreateWifiDto = z.infer<typeof bulkCreateWifiSchema>;
export type BulkDeleteWifiDto = z.infer<typeof bulkDeleteWifiSchema>;
export type AssignWifiDto = z.infer<typeof assignWifiSchema>;
export type ImportWifiDto = z.infer<typeof importWifiSchema>;
