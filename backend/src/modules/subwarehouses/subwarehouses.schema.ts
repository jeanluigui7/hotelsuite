import { z } from 'zod';

export const createSubWarehouseSchema = z.object({
  areaId: z.string().min(1),
  name: z.string().min(1).max(120),
  coverageType: z.enum(['MANUAL', 'RANGE', 'ALL']).default('MANUAL'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateSubWarehouseSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  coverageType: z.enum(['MANUAL', 'RANGE', 'ALL']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const setRoomsSchema = z.object({ roomIds: z.array(z.string().min(1)) });

export const setStockSchema = z.object({
  items: z.array(
    z.object({
      articleKind: z.string().min(1).max(30).default('LINEN_REUSABLE'),
      name: z.string().min(1).max(120),
      linenItemId: z.string().min(1).optional().or(z.literal('')),
      quantity: z.coerce.number().int().min(0),
    }),
  ),
});

export type CreateSubWarehouseDto = z.infer<typeof createSubWarehouseSchema>;
export type UpdateSubWarehouseDto = z.infer<typeof updateSubWarehouseSchema>;
export const supplySchema = z.object({
  items: z.array(
    z.object({
      articleKind: z.string().min(1).max(30).default('LINEN_REUSABLE'),
      name: z.string().min(1).max(120),
      quantity: z.coerce.number().int().min(1),
    }),
  ).min(1),
});

export type SetRoomsDto = z.infer<typeof setRoomsSchema>;
export type SetStockDto = z.infer<typeof setStockSchema>;
export type SupplyDto = z.infer<typeof supplySchema>;
