import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(150),
  categoryId: z.string().min(1).optional().nullable(),
  sku: z.string().max(60).optional().or(z.literal('')),
  barcode: z.string().max(60).optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
  brand: z.string().max(120).optional().or(z.literal('')),
  reusable: z.coerce.boolean().optional().default(false),
  productType: z.string().max(30).optional().default('PRODUCTO'),
  unit: z.string().max(10).optional().default('NIU'),
  igvType: z.string().max(20).optional().default('GRAVADO'),
  igvPercent: z.coerce.number().min(0).max(100).optional().default(18),
  taxable: z.coerce.boolean().optional().default(true),
  salePrice: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).optional(),
  reorderPoint: z.coerce.number().int().min(0).default(0),
  receptionReorderPoint: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  stock: z.coerce.number().int().min(0).default(0),
  // Área inicial: almacén donde se coloca el stock inicial (por defecto, el de productos).
  initialWarehouseId: z.string().min(1).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
