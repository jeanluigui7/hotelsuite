import { z } from 'zod';

export const ARTICLE_KINDS = ['LINEN_REUSABLE', 'AMENITY', 'SALE', 'ASSET'] as const;

export const createDotacionSchema = z.object({
  roomTypeId: z.string().min(1),
  category: z.string().max(120).optional().or(z.literal('')),
  articleKind: z.enum(ARTICLE_KINDS).default('LINEN_REUSABLE'),
  name: z.string().min(1).max(120),
  linenItemId: z.string().min(1).optional().or(z.literal('')),
  productId: z.string().min(1).optional().or(z.literal('')),
  baseQty: z.coerce.number().int().min(0).default(1),
  required: z.coerce.boolean().optional(),
  allowExtra: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateDotacionSchema = createDotacionSchema.partial();

export type CreateDotacionDto = z.infer<typeof createDotacionSchema>;
export type UpdateDotacionDto = z.infer<typeof updateDotacionSchema>;
