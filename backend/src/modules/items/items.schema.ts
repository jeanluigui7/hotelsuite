import { z } from 'zod';

export const ITEM_KINDS = ['CHECKIN', 'RATE', 'SERVICE_PENALTY', 'MAINTENANCE', 'SERVICE'] as const;

export const createItemSchema = z.object({
  kind: z.enum(ITEM_KINDS),
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional().or(z.literal('')),
  price: z.coerce.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateItemSchema = createItemSchema.partial();

export type CreateItemDto = z.infer<typeof createItemSchema>;
export type UpdateItemDto = z.infer<typeof updateItemSchema>;
