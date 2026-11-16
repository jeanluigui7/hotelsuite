import { z } from 'zod';

export const SEVERITIES = ['LEVE', 'INTERMEDIA', 'CRITICA'] as const;

export const createFaultTypeSchema = z.object({
  category: z.string().min(1).max(60),
  categoryLabel: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  severity: z.enum(SEVERITIES).default('LEVE'),
  status: z.enum(['active', 'inactive']).default('active'),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateFaultTypeSchema = createFaultTypeSchema.partial();

export type CreateFaultTypeDto = z.infer<typeof createFaultTypeSchema>;
export type UpdateFaultTypeDto = z.infer<typeof updateFaultTypeSchema>;
