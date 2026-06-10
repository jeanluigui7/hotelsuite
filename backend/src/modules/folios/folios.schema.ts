import { z } from 'zod';

export const createFolioSeriesSchema = z.object({
  documentType: z.enum(['BOLETA', 'FACTURA', 'NOTE']),
  series: z.string().min(2).max(10),
  currentNumber: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateFolioSeriesSchema = createFolioSeriesSchema.partial();

export type CreateFolioSeriesDto = z.infer<typeof createFolioSeriesSchema>;
export type UpdateFolioSeriesDto = z.infer<typeof updateFolioSeriesSchema>;
