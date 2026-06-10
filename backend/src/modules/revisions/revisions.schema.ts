import { z } from 'zod';

export const createRevisionSchema = z.object({
  roomId: z.string().uuid(),
  notes: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['PENDING', 'OK', 'ISSUE']).default('PENDING'),
});

export const updateRevisionSchema = createRevisionSchema.partial();

export type CreateRevisionDto = z.infer<typeof createRevisionSchema>;
export type UpdateRevisionDto = z.infer<typeof updateRevisionSchema>;
