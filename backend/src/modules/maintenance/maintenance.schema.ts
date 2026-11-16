import { z } from 'zod';

export const SEVERITIES = ['LEVE', 'INTERMEDIA', 'CRITICA'] as const;

export const createMaintenanceSchema = z.object({
  roomId: z.string().min(1).optional().nullable(),
  title: z.string().min(1).max(150),
  description: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('OPEN'),
  cost: z.coerce.number().min(0).optional(),
  assignedToUserId: z.string().min(1).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  // Snapshot del catálogo de fallas (la gravedad manda sobre `critical`).
  faultTypeId: z.string().min(1).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  categoryLabel: z.string().max(120).optional().nullable(),
  faultLabel: z.string().max(160).optional().nullable(),
  severity: z.enum(SEVERITIES).optional(),
  photo: z.string().optional().nullable(),
  // Compat: mantenimiento crítico (si no se envía gravedad, critical=true ⇒ CRITICA).
  critical: z.boolean().optional().default(true),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

/** Una falla dentro del reporte "Reportar falla" (se crea un Maintenance por cada una). */
export const faultLineSchema = z.object({
  faultTypeId: z.string().min(1).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  categoryLabel: z.string().max(120).optional().nullable(),
  faultLabel: z.string().max(160).optional().nullable(),
  severity: z.enum(SEVERITIES).optional(),
  observation: z.string().max(500).optional().or(z.literal('')),
  photo: z.string().optional().nullable(),
});

export const reportFaultsSchema = z.object({
  roomId: z.string().min(1),
  fallas: z.array(faultLineSchema).min(1).max(20),
});

/** Resolver una falla (registrar el trabajo realizado). */
export const resolveFaultSchema = z.object({
  resolutionNotes: z.string().min(1).max(500),
  repairedBy: z.string().max(160).optional().or(z.literal('')),
  resolutionPhoto: z.string().optional().nullable(),
  cost: z.coerce.number().min(0).optional(),
  status: z.enum(['DONE', 'CANCELLED']).default('DONE'),
});

export type CreateMaintenanceDto = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceDto = z.infer<typeof updateMaintenanceSchema>;
export type ReportFaultsDto = z.infer<typeof reportFaultsSchema>;
export type ResolveFaultDto = z.infer<typeof resolveFaultSchema>;
