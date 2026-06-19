import { z } from 'zod';

export const createConciergeSchema = z.object({
  roomId: z.string().min(1).optional().nullable(),
  guestName: z.string().max(160).optional().or(z.literal('')),
  category: z.string().max(60).optional().or(z.literal('')),
  description: z.string().min(1).max(500),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('PENDING'),
});

export const updateConciergeSchema = z.object({
  roomId: z.string().min(1).optional().nullable(),
  guestName: z.string().max(160).optional().or(z.literal('')),
  category: z.string().max(60).optional().or(z.literal('')),
  description: z.string().min(1).max(500).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
});

export type CreateConciergeDto = z.infer<typeof createConciergeSchema>;
export type UpdateConciergeDto = z.infer<typeof updateConciergeSchema>;
