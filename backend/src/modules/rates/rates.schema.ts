import { z } from 'zod';

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horario inválido (HH:MM)')
  .optional()
  .nullable();

// Servicio incluido en una tarifa (beneficio contratado).
export const includedServiceSchema = z.object({
  conceptId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  assignment: z.enum(['PER_ROOM', 'PER_PERSON']).default('PER_ROOM'),
  frequency: z.enum(['PER_STAY', 'PER_NIGHT']).default('PER_STAY'),
  availability: z.enum(['SAME_DAY', 'NEXT_MORNING']).default('SAME_DAY'),
  scheduleFrom: hhmm,
  scheduleTo: hhmm,
  place: z.enum(['ROOM', 'DINING', 'BOTH']).default('BOTH'),
});

export const createRateSchema = z.object({
  roomTypeId: z.string().min(1),
  label: z.string().min(1).max(80),
  durationMinutes: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
  pernocta: z.coerce.boolean().optional().default(false),
  special: z.coerce.boolean().optional().default(false),
  status: z.enum(['active', 'inactive']).default('active'),
  // Lista completa de servicios incluidos (reemplaza la existente al editar). Opcional.
  includedServices: z.array(includedServiceSchema).optional(),
});

export const updateRateSchema = createRateSchema.partial();

export const createCustomRateSchema = z.object({
  roomTypeId: z.string().min(1),
  tierId: z.string().min(1).optional().nullable(),
  label: z.string().min(1).max(80),
  durationMinutes: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
  validFrom: z.coerce.date().optional().nullable(),
  validTo: z.coerce.date().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateCustomRateSchema = createCustomRateSchema.partial();

export type CreateRateDto = z.infer<typeof createRateSchema>;
export type UpdateRateDto = z.infer<typeof updateRateSchema>;
export type CreateCustomRateDto = z.infer<typeof createCustomRateSchema>;
export type UpdateCustomRateDto = z.infer<typeof updateCustomRateSchema>;
