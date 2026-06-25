import { z } from 'zod';

export const createRoomSchema = z.object({
  roomTypeId: z.string().min(1),
  number: z.string().min(1).max(20),
  floor: z.string().max(20).optional().or(z.literal('')),
  notes: z.string().max(300).optional().or(z.literal('')),
  imageUrl: z.string().max(500_000).optional().or(z.literal('')),
  frigobarEnabled: z.coerce.boolean().optional(),
});

export const updateRoomSchema = createRoomSchema.partial();

// Manual status changes never set OCCUPIED (that happens via check-in).
export const changeRoomStatusSchema = z.object({
  status: z.enum(['FREE', 'CLEANING', 'MAINTENANCE', 'RESERVADA', 'LIMPIEZA_SOLICITADA', 'LIMPIEZA_EN_CURSO']),
});

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
export type ChangeRoomStatusDto = z.infer<typeof changeRoomStatusSchema>;
