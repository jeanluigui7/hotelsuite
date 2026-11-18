import { z } from 'zod';

const huespedSchema = z.object({
  guestId: z.string().optional().nullable(),
  firstName: z.string().min(1).max(120),
  lastName: z.string().max(120).optional().nullable(),
  documentType: z.string().max(20).optional().nullable(),
  documentNumber: z.string().max(40).optional().nullable(),
  nationality: z.string().max(60).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

const habitacionSchema = z.object({
  roomTypeId: z.string().min(1),
  roomTypeName: z.string().max(120).optional().nullable(),
  roomId: z.string().min(1).optional().nullable(),
  roomNumber: z.string().max(40).optional().nullable(),
  rateId: z.string().min(1).optional().nullable(),
  precio: z.coerce.number().min(0).optional().nullable(),
  adults: z.coerce.number().int().min(1).default(1),
  children: z.coerce.number().int().min(0).default(0),
  requisitos: z.array(z.string().max(120)).default([]),
  preferencias: z.array(z.string().max(120)).default([]),
  huespedes: z.array(huespedSchema).default([]),
});

const contactoSchema = z.object({
  tipo: z.enum(['PERSONA', 'EMPRESA']).default('PERSONA'),
  guestId: z.string().optional().nullable(),
  documentType: z.string().max(20).optional().nullable(),
  documentNumber: z.string().max(40).optional().nullable(),
  nombre: z.string().max(160).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  telefonoAlt: z.string().max(30).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
});

const cocheraSchema = z.object({
  requiere: z.boolean().default(false),
  vehiculos: z.coerce.number().int().min(0).default(0),
  estado: z.enum(['SOLICITADA', 'CONFIRMADA']).default('SOLICITADA'),
  precio: z.coerce.number().min(0).optional().nullable(),
  placas: z.array(z.string().max(20)).default([]),
});

const pagoSchema = z.object({
  importe: z.coerce.number().positive(),
  medio: z.string().min(1).max(40),
  destino: z.string().max(120).optional().nullable(),
  operacion: z.string().max(120).optional().nullable(),
  observacion: z.string().max(300).optional().nullable(),
  fecha: z.coerce.date().optional(),
});

const programadoSchema = z.object({
  vence: z.coerce.date().optional().nullable(),
  modo: z.enum(['FIJO', 'PORCENTAJE']).default('PORCENTAJE'),
  valor: z.coerce.number().min(0),
  base: z.enum(['TOTAL', 'SALDO']).default('TOTAL'),
});

const condicionesSchema = z.object({
  politicaNombre: z.string().max(160).optional().nullable(),
  politicaVersion: z.string().max(40).optional().nullable(),
  adelantoRequerido: z.coerce.number().min(0).optional().nullable(),
  plazoPago: z.string().max(160).optional().nullable(),
  venceTentativaAt: z.coerce.date().optional().nullable(),
  cancelacion: z.string().max(400).optional().nullable(),
  noShow: z.string().max(400).optional().nullable(),
  aceptacion: z.enum(['PENDIENTE', 'REGISTRADA']).default('PENDIENTE'),
});

export const createReservationSchema = z.object({
  codigo: z.string().max(40).optional().nullable(),
  estado: z.enum(['TENTATIVA', 'CONFIRMADA']).default('TENTATIVA'),
  modalidad: z.enum(['HORAS', 'PERNOCTE']).default('PERNOCTE'),
  entradaAt: z.coerce.date(),
  salidaAt: z.coerce.date(),
  origen: z.enum(['RECEPCION', 'WHATSAPP', 'TELEFONO_FIJO', 'CELULAR', 'WEB', 'OTA', 'OTRO']).default('RECEPCION'),
  contacto: contactoSchema,
  habitaciones: z.array(habitacionSchema).min(1),
  cochera: cocheraSchema.optional(),
  pagos: z.array(pagoSchema).default([]),
  pagosProgramados: z.array(programadoSchema).default([]),
  condiciones: condicionesSchema.optional(),
  notaInterna: z.string().max(500).optional().nullable(),
  observacionCliente: z.string().max(500).optional().nullable(),
});

export const updateReservationSchema = createReservationSchema;

/** Alta de un pago recibido a una reserva existente (desde el detalle). */
export const addPaymentSchema = z.object({
  importe: z.coerce.number().positive(),
  medio: z.string().min(1).max(40),
  destino: z.string().max(120).optional().nullable(),
  operacion: z.string().max(120).optional().nullable(),
  observacion: z.string().max(300).optional().nullable(),
  fecha: z.coerce.date().optional(),
});
export type AddPaymentDto = z.infer<typeof addPaymentSchema>;

/** Cambios de estado puntuales desde el detalle. */
export const changeStatusSchema = z.object({
  estado: z.enum(['CONFIRMADA', 'CANCELADA', 'NO_SHOW', 'VENCIDA']),
  motivo: z.string().max(300).optional().nullable(),
});

export const availabilityQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  roomTypeId: z.string().optional(),
  requisitos: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  prepMin: z.coerce.number().int().min(0).optional(),
  vehicles: z.coerce.number().int().min(0).optional(),
  excludeReservationId: z.string().optional(),
});

export type AvailabilityQueryDto = z.infer<typeof availabilityQuerySchema>;
export type CreateReservationDto = z.infer<typeof createReservationSchema>;
export type UpdateReservationDto = z.infer<typeof updateReservationSchema>;
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;
