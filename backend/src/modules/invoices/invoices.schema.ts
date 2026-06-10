import { z } from 'zod';

export const issueInvoiceSchema = z
  .object({
    saleId: z.string().uuid().optional().nullable(),
    type: z.enum(['BOLETA', 'FACTURA']),
    customerName: z.string().min(1).max(160),
    customerDoc: z.string().max(20).optional().or(z.literal('')),
    total: z.coerce.number().positive().optional(),
  })
  .refine((v) => v.saleId || v.total !== undefined, {
    message: 'Indique una venta (saleId) o un total manual',
    path: ['total'],
  });

export type IssueInvoiceDto = z.infer<typeof issueInvoiceSchema>;
