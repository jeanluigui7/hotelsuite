import { z } from 'zod';

export const createMaintenanceSchema = z.object({
  roomId: z.string().min(1).optional().nullable(),
  title: z.string().min(1).max(150),
  description: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('OPEN'),
  cost: z.coerce.number().min(0).optional(),
  assignedToUserId: z.string().min(1).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  // Mantenimiento crítico: bloquea la habitación (MANTENIMIENTO) hasta resolverse.
  critical: z.boolean().optional().default(true),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export type CreateMaintenanceDto = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceDto = z.infer<typeof updateMaintenanceSchema>;
