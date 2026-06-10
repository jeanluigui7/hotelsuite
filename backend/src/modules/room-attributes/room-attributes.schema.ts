import { z } from 'zod';

export const createRoomAttributeSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().max(60).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateRoomAttributeSchema = createRoomAttributeSchema.partial();

export type CreateRoomAttributeDto = z.infer<typeof createRoomAttributeSchema>;
export type UpdateRoomAttributeDto = z.infer<typeof updateRoomAttributeSchema>;
