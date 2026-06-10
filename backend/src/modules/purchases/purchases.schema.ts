import { z } from 'zod';

const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().min(0),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  documentNumber: z.string().max(40).optional().or(z.literal('')),
  notes: z.string().max(300).optional().or(z.literal('')),
  items: z.array(purchaseItemSchema).min(1, 'Agregue al menos un ítem'),
});

export type CreatePurchaseDto = z.infer<typeof createPurchaseSchema>;
