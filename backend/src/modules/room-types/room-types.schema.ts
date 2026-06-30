import { z } from 'zod';

export const createRoomTypeSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional().or(z.literal('')),
  capacity: z.coerce.number().int().min(1).max(50).default(2),
  basePrice: z.coerce.number().min(0).optional(),
  extraHourPrice: z.coerce.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  attributeIds: z.array(z.string().min(1)).default([]),
});

export const updateRoomTypeSchema = createRoomTypeSchema.partial();

export type CreateRoomTypeDto = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeDto = z.infer<typeof updateRoomTypeSchema>;
