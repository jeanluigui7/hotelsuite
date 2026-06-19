import { z } from 'zod';

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().min(0),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  documentNumber: z.string().max(40).optional().or(z.literal('')),
  notes: z.string().max(300).optional().or(z.literal('')),
  items: z.array(purchaseItemSchema).min(1, 'Agregue al menos un ítem'),
});

export type CreatePurchaseDto = z.infer<typeof createPurchaseSchema>;
