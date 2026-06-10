import { z } from 'zod';

export const createAttendanceSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(['IN', 'OUT']),
  at: z.coerce.date().optional(),
  note: z.string().max(200).optional().or(z.literal('')),
});

export type CreateAttendanceDto = z.infer<typeof createAttendanceSchema>;
