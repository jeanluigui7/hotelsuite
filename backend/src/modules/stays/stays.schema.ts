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
    // rateId opcional: si no viene, es "Tarifa personalizada" (salida + precio propios).
    rateId: z.string().min(1).optional(),
    tierId: z.string().min(1).optional().nullable(),
    guestId: z.string().min(1).optional(),
    newGuest: newGuestSchema.optional(),
    additionalGuestIds: z.array(z.string().min(1)).default([]),
    adults: z.coerce.number().int().min(1).default(1),
    children: z.coerce.number().int().min(0).default(0),
    vehiclePlate: z.string().max(20).optional().or(z.literal('')),
    notes: z.string().max(500).optional().or(z.literal('')),
    // Pernoctación / día hotelero: nº de noches y precio final editable.
    nights: z.coerce.number().int().min(1).max(60).optional(),
    priceOverride: z.coerce.number().min(0).optional(),
    // Early check-in opcional (solo aplica el cargo si se marca).
    earlyCheckin: z.coerce.boolean().optional().default(false),
    // Tarifa personalizada: fecha/hora de salida elegida por el usuario.
    customCheckoutAt: z.coerce.date().optional(),
  })
  .refine((v) => v.guestId || v.newGuest, {
    message: 'Debe indicar un huésped existente (guestId) o los datos de uno nuevo (newGuest)',
    path: ['guestId'],
  })
  .refine((v) => v.rateId || (v.customCheckoutAt && v.priceOverride != null), {
    message: 'Indica una tarifa, o (tarifa personalizada) la fecha de salida y el precio',
    path: ['rateId'],
  });

export const checkOutSchema = z.object({
  // Estado al que pasa la habitación tras el check-out.
  roomStatus: z.enum(['CLEANING', 'FREE']).default('CLEANING'),
});

export const changeRoomSchema = z.object({
  destRoomId: z.string().min(1),
  // Cómo debe quedar la habitación de origen: sucia para limpieza o disponible.
  originStatus: z.enum(['CLEANING', 'FREE']).default('CLEANING'),
});

export const renewSchema = z.object({
  amount: z.coerce.number().min(0).optional(), // monto de la renovación (default = precio de la estancia)
  chargeNow: z.coerce.boolean().default(false), // cobrar en el momento o dejar pendiente
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'WALLET']).optional(),
  requestCleaning: z.coerce.boolean().default(false), // limpieza de renovación (no libera la habitación)
});

export type CheckInDto = z.infer<typeof checkInSchema>;
export type CheckOutDto = z.infer<typeof checkOutSchema>;
export type ChangeRoomDto = z.infer<typeof changeRoomSchema>;
export type RenewDto = z.infer<typeof renewSchema>;
