import { z } from 'zod';

export const CATEGORY_TYPES = ['PRODUCTS', 'CLOTHING', 'CLEANING', 'AMENITIES'] as const;

export const createInventoryCategorySchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(CATEGORY_TYPES).nullable().optional(),
  description: z.string().max(300).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateInventoryCategorySchema = createInventoryCategorySchema.partial();

export type CreateInventoryCategoryDto = z.infer<typeof createInventoryCategorySchema>;
export type UpdateInventoryCategoryDto = z.infer<typeof updateInventoryCategorySchema>;
