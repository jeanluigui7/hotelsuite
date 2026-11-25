import { z } from 'zod';

export const createAttendanceSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['IN', 'OUT']),
  at: z.coerce.date().optional(),
  note: z.string().max(200).optional().or(z.literal('')),
});

export type CreateAttendanceDto = z.infer<typeof createAttendanceSchema>;

export const dailyQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  role: z.string().max(120).optional(),
  shift: z.string().max(20).optional(),
  userId: z.string().max(60).optional(),
  search: z.string().max(120).optional(),
});

export const monthlyQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  role: z.string().max(120).optional(),
  userId: z.string().max(60).optional(),
  search: z.string().max(120).optional(),
});

export type DailyQueryDto = z.infer<typeof dailyQuerySchema>;
export type MonthlyQueryDto = z.infer<typeof monthlyQuerySchema>;
