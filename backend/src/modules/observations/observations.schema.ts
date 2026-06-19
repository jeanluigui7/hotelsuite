import { z } from 'zod';

export const createObservationSchema = z.object({
  roomId: z.string().min(1).optional().nullable(),
  title: z.string().max(120).optional().or(z.literal('')),
  body: z.string().min(1).max(1000),
  status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'),
});

export const updateObservationSchema = z.object({
  roomId: z.string().min(1).optional().nullable(),
  title: z.string().max(120).optional().or(z.literal('')),
  body: z.string().min(1).max(1000).optional(),
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
});

export type CreateObservationDto = z.infer<typeof createObservationSchema>;
export type UpdateObservationDto = z.infer<typeof updateObservationSchema>;
