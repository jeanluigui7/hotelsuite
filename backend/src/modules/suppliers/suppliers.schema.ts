import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(150),
  taxId: z.string().max(20).optional().or(z.literal('')),
  contact: z.string().max(120).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email().max(160).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;
