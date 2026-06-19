import { z } from 'zod';

export const createLaundryTaskSchema = z.object({
  machineId: z.string().min(1).optional().nullable(),
  description: z.string().min(1).max(200),
  status: z.enum(['PENDING', 'WASHING', 'DONE']).default('PENDING'),
});

export const updateLaundryTaskSchema = createLaundryTaskSchema.partial();

export type CreateLaundryTaskDto = z.infer<typeof createLaundryTaskSchema>;
export type UpdateLaundryTaskDto = z.infer<typeof updateLaundryTaskSchema>;
