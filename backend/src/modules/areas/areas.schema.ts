import { z } from 'zod';

export const createAreaSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional().or(z.literal('')),
  managesFloors: z.coerce.boolean().optional(),
  warehouseId: z.string().min(1).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateAreaSchema = createAreaSchema.partial();

export type CreateAreaDto = z.infer<typeof createAreaSchema>;
export type UpdateAreaDto = z.infer<typeof updateAreaSchema>;
