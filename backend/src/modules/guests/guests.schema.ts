import { z } from 'zod';

export const createGuestSchema = z.object({
  documentType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']).default('DNI'),
  documentNumber: z.string().min(3).max(20),
  firstName: z.string().min(1).max(120),
  lastName: z.string().max(120).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email().max(160).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateGuestSchema = createGuestSchema.partial();

export type CreateGuestDto = z.infer<typeof createGuestSchema>;
export type UpdateGuestDto = z.infer<typeof updateGuestSchema>;
