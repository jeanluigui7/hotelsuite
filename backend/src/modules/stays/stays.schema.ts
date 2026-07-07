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
  mode: z.enum(['NIGHTS', 'HOURS']).default('NIGHTS'),
  // Nueva fecha/hora de salida (la elige el calendario o el cálculo de horas).
  newCheckoutAt: z.coerce.date().optional(),
  nights: z.coerce.number().int().min(1).optional(),
  hours: z.coerce.number().int().min(1).optional(),
  // Monto a cobrar por la renovación (libre; el cálculo por noche/hora es solo guía).
  amount: z.coerce.number().min(0),
  // Pagos registrados ahora (pueden ser varios métodos; vacío = pago diferido / deuda).
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'CARD', 'TRANSFER', 'WALLET']),
        amount: z.coerce.number().min(0),
        reference: z.string().max(120).optional().or(z.literal('')),
      }),
    )
    .default([]),
  notes: z.string().max(300).optional().or(z.literal('')),
  requestCleaning: z.coerce.boolean().default(false),
});

/** Cobro del pendiente de una estancia (abona a sus ventas OPEN / adeudo). */
export const payStaySchema = z.object({
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'WALLET']),
  amount: z.coerce.number().positive(),
  reference: z.string().max(120).optional().or(z.literal('')),
});

/** Edición rápida de la estancia (recepción): teléfono, placa y acompañantes. */
export const updateStayDetailsSchema = z.object({
  phone: z.string().max(30).optional(),
  vehiclePlate: z.string().max(20).optional(),
  addGuests: z
    .array(
      z.object({
        documentType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).default('DNI'),
        documentNumber: z.string().min(3).max(20),
        firstName: z.string().min(1).max(120),
        lastName: z.string().max(120).optional().or(z.literal('')),
        phone: z.string().max(30).optional().or(z.literal('')),
      }),
    )
    .optional(),
  removeGuestIds: z.array(z.string().min(1)).optional(),
});

export type CheckInDto = z.infer<typeof checkInSchema>;
export type CheckOutDto = z.infer<typeof checkOutSchema>;
export type ChangeRoomDto = z.infer<typeof changeRoomSchema>;
export type RenewDto = z.infer<typeof renewSchema>;
export type PayStayDto = z.infer<typeof payStaySchema>;
export type UpdateStayDetailsDto = z.infer<typeof updateStayDetailsSchema>;
