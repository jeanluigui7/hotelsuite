import { z } from 'zod';

export const createNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  type: z.enum(['CREDIT', 'DEBIT']),
  reason: z.string().min(1).max(300),
  total: z.coerce.number().positive(),
});

export type CreateNoteDto = z.infer<typeof createNoteSchema>;
