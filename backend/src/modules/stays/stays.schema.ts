import { z } from 'zod';

const newGuestSchema = z.object({
  documentType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).default('DNI'),
  documentNumber: z.string().min(3).max(20),
  firstName: z.string().min(1).max(120),
  lastName: z.string().max(120).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email().max(160).optional().or(z.literal('')),
});

export const checkInSchema = z
  .object({
    roomId: z.string().min(1),
    rateId: z.string().min(1),
    tierId: z.string().min(1).optional().nullable(),
    guestId: z.string().min(1).optional(),
    newGuest: newGuestSchema.optional(),
    additionalGuestIds: z.array(z.string().min(1)).default([]),
    adults: z.coerce.number().int().min(1).default(1),
    children: z.coerce.number().int().min(0).default(0),
    vehiclePlate: z.string().max(20).optional().or(z.literal('')),
    notes: z.string().max(500).optional().or(z.literal('')),
  })
  .refine((v) => v.guestId || v.newGuest, {
    message: 'Debe indicar un huésped existente (guestId) o los datos de uno nuevo (newGuest)',
    path: ['guestId'],
  });

export const checkOutSchema = z.object({
  // Estado al que pasa la habitación tras el check-out.
  roomStatus: z.enum(['CLEANING', 'FREE']).default('CLEANING'),
});

export type CheckInDto = z.infer<typeof checkInSchema>;
export type CheckOutDto = z.infer<typeof checkOutSchema>;
