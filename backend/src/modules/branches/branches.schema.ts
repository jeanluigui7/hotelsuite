import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(250).optional(),
  taxId: z.string().max(20).optional(),
  currency: z.string().length(3).default('PEN'),
  cutoffHour: z.coerce.number().int().min(0).max(23).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateBranchSchema = createBranchSchema.partial();

export type CreateBranchDto = z.infer<typeof createBranchSchema>;
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;
