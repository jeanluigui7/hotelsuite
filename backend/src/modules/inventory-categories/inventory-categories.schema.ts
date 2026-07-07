import { z } from 'zod';

export const CATEGORY_TYPES = ['CLOTHING', 'AMENITY', 'PRODUCT', 'CLEANING_SUPPLY'] as const;

export const createInventoryCategorySchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(CATEGORY_TYPES).nullable().optional(),
  description: z.string().max(300).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
  // Tamaños (solo se guardan cuando type = CLOTHING); texto libre, sin repetidos.
  sizes: z.array(z.string().trim().min(1).max(60)).optional(),
});

export const updateInventoryCategorySchema = createInventoryCategorySchema.partial();

export type CreateInventoryCategoryDto = z.infer<typeof createInventoryCategorySchema>;
export type UpdateInventoryCategoryDto = z.infer<typeof updateInventoryCategorySchema>;
