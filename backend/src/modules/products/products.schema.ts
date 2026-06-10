import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(150),
  categoryId: z.string().uuid().optional().nullable(),
  sku: z.string().max(60).optional().or(z.literal('')),
  salePrice: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  stock: z.coerce.number().int().min(0).default(0),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
