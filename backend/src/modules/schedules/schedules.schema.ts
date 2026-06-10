import { z } from 'zod';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(120),
  startTime: z.string().regex(TIME, 'Formato HH:mm'),
  endTime: z.string().regex(TIME, 'Formato HH:mm'),
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([]),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;
