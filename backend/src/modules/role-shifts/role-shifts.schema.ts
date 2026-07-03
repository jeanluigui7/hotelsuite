import { z } from 'zod';

export const ROLES = ['RECEPCION', 'LIMPIEZA'] as const;
export const SHIFTS = ['MANANA', 'TARDE', 'NOCHE'] as const;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:mm)');

const shiftItemSchema = z.object({
  role: z.enum(ROLES),
  shift: z.enum(SHIFTS),
  startTime: hhmm,
  endTime: hhmm,
  toleranceMinutes: z.coerce.number().int().min(0).max(240).default(5),
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([]),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const saveRoleShiftsSchema = z.object({
  shifts: z.array(shiftItemSchema).min(1),
});

export type ShiftItemDto = z.infer<typeof shiftItemSchema>;
export type SaveRoleShiftsDto = z.infer<typeof saveRoleShiftsSchema>;
