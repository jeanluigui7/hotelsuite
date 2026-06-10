import { z } from 'zod';

export const createClientTierSchema = z.object({
  name: z.string().min(1).max(80),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  description: z.string().max(250).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateClientTierSchema = createClientTierSchema.partial();

export type CreateClientTierDto = z.infer<typeof createClientTierSchema>;
export type UpdateClientTierDto = z.infer<typeof updateClientTierSchema>;
