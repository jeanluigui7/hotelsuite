import { z } from 'zod';

export const createDeviceSchema = z.object({
  name: z.string().min(1).max(120),
  ip: z.string().min(7).max(45),
  port: z.coerce.number().int().min(1).max(65535).default(4370),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export const enrollSchema = z.object({
  userId: z.string().min(1),
  deviceUserId: z.string().min(1).max(40),
  name: z.string().max(120).optional().or(z.literal('')),
});

// ── Agente local (ingesta de marcas desde la LAN del hotel) ──
export const ingestSchema = z.object({
  deviceId: z.string().min(1),
  marks: z
    .array(
      z.object({
        deviceUserId: z.string().min(1).max(40),
        at: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export const heartbeatSchema = z.object({
  deviceId: z.string().min(1),
  info: z.object({ serial: z.string().max(120).optional(), name: z.string().max(120).optional(), connected: z.boolean().optional() }).optional(),
});
// Vincular número de serie (ADMS/nube) a un dispositivo.
export const bindSerialSchema = z.object({ serial: z.string().min(1).max(64) });
// Usar la tecla ENTRADA/SALIDA del equipo (col 3 del ATTLOG) en vez de alternar.
export const admsStateSchema = z.object({ useState: z.boolean() });

export type CreateDeviceDto = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceDto = z.infer<typeof updateDeviceSchema>;
export type EnrollDto = z.infer<typeof enrollSchema>;
export type IngestDto = z.infer<typeof ingestSchema>;
export type IngestMark = IngestDto['marks'][number];
