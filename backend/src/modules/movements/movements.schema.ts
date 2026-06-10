import { z } from 'zod';

export const adjustSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.coerce.number().int().refine((n) => n !== 0, 'La cantidad no puede ser cero'),
  reference: z.string().max(200).optional().or(z.literal('')),
});

export const transferSchema = z
  .object({
    productId: z.string().uuid(),
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
    reference: z.string().max(200).optional().or(z.literal('')),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: 'Los almacenes deben ser distintos',
    path: ['toWarehouseId'],
  });

export type AdjustDto = z.infer<typeof adjustSchema>;
export type TransferDto = z.infer<typeof transferSchema>;
