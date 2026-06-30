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

export type CreateSubWarehouseDto = z.infer<typeof createSubWarehouseSchema>;
export type UpdateSubWarehouseDto = z.infer<typeof updateSubWarehouseSchema>;
export type SetRoomsDto = z.infer<typeof setRoomsSchema>;
