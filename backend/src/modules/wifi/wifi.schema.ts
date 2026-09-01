import { z } from 'zod';

export const WIFI_CATEGORIES = ['PERNOCTACION', 'ESTADIA_CORTA', 'PERSONALIZADA', 'GRATIS'] as const;
const categoryEnum = z.enum(WIFI_CATEGORIES);

export const createWifiSchema = z.object({
  ssid: z.string().min(1).max(120),
  password: z.string().min(1).max(120),
  category: categoryEnum.default('PERNOCTACION'),
  code: z.string().max(60).optional().or(z.literal('')),
  voucher: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(250).optional().or(z.literal('')),
  validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().max(300).optional().or(z.literal('')),
});

export const updateWifiSchema = z.object({
  ssid: z.string().min(1).max(120).optional(),
  password: z.string().min(1).max(120).optional(),
  code: z.string().max(60).optional().or(z.literal('')),
  category: categoryEnum.optional(),
  validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().max(300).optional().or(z.literal('')),
});

/** Crear varias credenciales de una categoría con sus contraseñas. */
export const bulkCreateWifiSchema = z.object({
  ssid: z.string().min(1).max(120),
  category: categoryEnum.default('PERNOCTACION'),
  passwords: z.array(z.string().min(1).max(120)).min(1).max(100),
  codes: z.array(z.string().max(60)).optional(),
  validMinutes: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().max(300).optional().or(z.literal('')),
});

export const bulkDeleteWifiSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

/** Importación masiva (CSV/Excel parseado en el front). */
export const importWifiSchema = z.object({
  rows: z.array(z.object({
    ssid: z.string().max(120),
    password: z.string().max(120),
    code: z.string().max(60).optional(),
    category: z.string().max(30).optional(),
  })).min(1).max(2000),
});

/** Asignar una credencial a la estancia activa de una habitación. */
export const assignWifiSchema = z.object({ stayId: z.string().min(1) });

export type CreateWifiDto = z.infer<typeof createWifiSchema>;
export type UpdateWifiDto = z.infer<typeof updateWifiSchema>;
export type BulkCreateWifiDto = z.infer<typeof bulkCreateWifiSchema>;
export type BulkDeleteWifiDto = z.infer<typeof bulkDeleteWifiSchema>;
export type AssignWifiDto = z.infer<typeof assignWifiSchema>;
