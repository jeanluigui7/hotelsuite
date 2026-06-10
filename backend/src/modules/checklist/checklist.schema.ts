import { z } from 'zod';

export const createChecklistItemSchema = z.object({
  name: z.string().min(1).max(150),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateChecklistItemSchema = createChecklistItemSchema.partial();

export type CreateChecklistItemDto = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemDto = z.infer<typeof updateChecklistItemSchema>;
