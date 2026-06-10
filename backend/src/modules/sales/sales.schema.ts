import { z } from 'zod';
import { PAYMENT_METHODS } from '../../shared/payments';

const saleItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    description: z.string().max(200).optional(),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(),
  })
  .refine((v) => v.productId || (v.description && v.unitPrice !== undefined), {
    message: 'Cada línea requiere un producto, o descripción y precio',
  });

const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.coerce.number().positive(),
  reference: z.string().max(120).optional().or(z.literal('')),
});

export const createSaleSchema = z
  .object({
    stayId: z.string().uuid().optional().nullable(),
    guestId: z.string().uuid().optional().nullable(),
    customerName: z.string().max(160).optional().or(z.literal('')),
    items: z.array(saleItemSchema).min(1, 'Agregue al menos un ítem'),
    payments: z.array(paymentSchema).default([]),
  })
  .refine((v) => v.stayId || v.guestId || (v.customerName && v.customerName.length > 0), {
    message: 'Indique una estancia, un cliente o un nombre de cliente externo',
    path: ['customerName'],
  });

export type CreateSaleDto = z.infer<typeof createSaleSchema>;
