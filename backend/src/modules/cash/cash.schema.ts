import { z } from 'zod';

export const openCashSchema = z.object({
  openingAmount: z.coerce.number().min(0).default(0),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const closeCashSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export type OpenCashDto = z.infer<typeof openCashSchema>;
export type CloseCashDto = z.infer<typeof closeCashSchema>;
