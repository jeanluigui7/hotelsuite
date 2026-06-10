import { z } from 'zod';

export const WAREHOUSE_TYPES = [
  'PRODUCTS',
  'CLOTHING',
  'RECEPTION',
  'CLEANING',
  'LAUNDRY',
  'AMENITIES',
] as const;

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(WAREHOUSE_TYPES).default('PRODUCTS'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseDto = z.infer<typeof updateWarehouseSchema>;
