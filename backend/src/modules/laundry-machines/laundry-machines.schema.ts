import { z } from 'zod';

export const createLaundryMachineSchema = z.object({
  name: z.string().min(1).max(120),
  capacity: z.string().max(60).optional().or(z.literal('')),
  status: z.enum(['available', 'busy', 'maintenance']).default('available'),
});

export const updateLaundryMachineSchema = createLaundryMachineSchema.partial();

export type CreateLaundryMachineDto = z.infer<typeof createLaundryMachineSchema>;
export type UpdateLaundryMachineDto = z.infer<typeof updateLaundryMachineSchema>;
