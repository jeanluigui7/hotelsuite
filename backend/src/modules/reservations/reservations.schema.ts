import { z } from 'zod';

export const createReservationSchema = z
  .object({
    roomTypeId: z.string().min(1),
    roomId: z.string().min(1).optional().nullable(),
    guestId: z.string().min(1).optional().nullable(),
    guestName: z.string().max(160).optional().or(z.literal('')),
    phone: z.string().max(30).optional().or(z.literal('')),
    expectedCheckInAt: z.coerce.date(),
    durationMinutes: z.coerce.number().int().min(1).default(1440),
    adults: z.coerce.number().int().min(1).default(1),
    children: z.coerce.number().int().min(0).default(0),
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'FULFILLED']).default('PENDING'),
    notes: z.string().max(500).optional().or(z.literal('')),
  })
  .refine((v) => v.guestId || (v.guestName && v.guestName.length > 0), {
    message: 'Indique un cliente registrado o el nombre del huésped',
    path: ['guestName'],
  });

export const updateReservationSchema = z.object({
  roomTypeId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional().nullable(),
  guestId: z.string().min(1).optional().nullable(),
  guestName: z.string().max(160).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  expectedCheckInAt: z.coerce.date().optional(),
  durationMinutes: z.coerce.number().int().min(1).optional(),
  adults: z.coerce.number().int().min(1).optional(),
  children: z.coerce.number().int().min(0).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'FULFILLED']).optional(),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export type CreateReservationDto = z.infer<typeof createReservationSchema>;
export type UpdateReservationDto = z.infer<typeof updateReservationSchema>;
