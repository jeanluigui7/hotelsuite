import { z } from 'zod';

export const AREA_TYPES = ['LIMPIEZA', 'RECEPCION', 'LAVANDERIA', 'ROPA', 'AMENITIES'] as const;

export const createAreaSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional().or(z.literal('')),
  type: z.enum(AREA_TYPES).default('LIMPIEZA'),
  managesSubwarehouses: z.coerce.boolean().optional(),
  managesFloors: z.coerce.boolean().optional(),
  warehouseId: z.string().min(1).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
  // Subalmacén inicial opcional (paso 1 del asistente).
  firstSubWarehouse: z.string().min(1).max(120).optional().or(z.literal('')),
  coverageType: z.enum(['MANUAL', 'RANGE', 'ALL']).optional(),
});

export const updateAreaSchema = createAreaSchema.partial();

export type CreateAreaDto = z.infer<typeof createAreaSchema>;
export type UpdateAreaDto = z.infer<typeof updateAreaSchema>;
