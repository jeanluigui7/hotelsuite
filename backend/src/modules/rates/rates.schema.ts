import { z } from 'zod';

export const createRateSchema = z.object({
  roomTypeId: z.string().uuid(),
  label: z.string().min(1).max(80),
  durationMinutes: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateRateSchema = createRateSchema.partial();

export const createCustomRateSchema = z.object({
  roomTypeId: z.string().uuid(),
  tierId: z.string().uuid().optional().nullable(),
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
