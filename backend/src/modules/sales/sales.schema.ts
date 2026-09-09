import { z } from 'zod';
import { PAYMENT_METHODS, PAYMENT_REFERENCE_REQUIRED, hasRequiredReference } from '../../shared/payments';

const saleItemSchema = z
  .object({
    productId: z.string().min(1).optional(),
    description: z.string().max(200).optional(),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(),
  })
  .refine((v) => v.productId || (v.description && v.unitPrice !== undefined), {
    message: 'Cada línea requiere un producto, o descripción y precio',
  });

// El código de operación es OBLIGATORIO para pagos virtuales (Yape/Plin/Transferencia/Tarjeta).
// Los frontends lo exigen antes de enviar; este refine es la red de seguridad del backend.
const paymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amount: z.coerce.number().positive(),
    reference: z.string().max(120).optional().or(z.literal('')),
  })
  .refine(hasRequiredReference, { message: PAYMENT_REFERENCE_REQUIRED, path: ['reference'] });

export const createSaleSchema = z
  .object({
    stayId: z.string().min(1).optional().nullable(),
    guestId: z.string().min(1).optional().nullable(),
    customerName: z.string().max(160).optional().or(z.literal('')),
    items: z.array(saleItemSchema).min(1, 'Agregue al menos un ítem'),
    payments: z.array(paymentSchema).default([]),
    // Área de la que sale el stock: PRODUCTS (general, por defecto) | RECEPTION | FRIGOBAR.
    sourceArea: z.enum(['PRODUCTS', 'RECEPTION', 'FRIGOBAR']).optional(),
  })
  .refine((v) => v.stayId || v.guestId || (v.customerName && v.customerName.length > 0), {
    message: 'Indique una estancia, un cliente o un nombre de cliente externo',
    path: ['customerName'],
  });

/** Corrección de una venta desde el detalle de caja: cambia el método de pago. */
export const correctSaleSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  reason: z.string().max(500).optional(),
});

/** Corrección del DESGLOSE de pagos de una venta (método+monto por línea). El total NO cambia:
 * solo se re-reparte cómo se pagó (p. ej. un Yape de 31 → Yape 25 + Efectivo 6). */
export const correctPaymentsSchema = z.object({
  payments: z.array(paymentSchema).min(1, 'Agregue al menos un pago'),
  reason: z.string().max(500).optional(),
});

/** Corrección POR LÍNEA de una venta: método/código (desglose), cambio de PRODUCTO (mismo precio) y
 * habitación/origen. NO cambia cantidad ni precio. El desglose conserva lo cobrado. */
export const correctSaleLinesSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    productId: z.string().min(1).nullable().optional(), // producto de reemplazo (mismo precio); null/omitido = sin cambio
  })).min(1, 'Envía las líneas de la venta'),
  payments: z.array(paymentSchema).min(1, 'Agregue al menos un pago'),
  stayId: z.string().min(1).nullable().optional(), // habitación/origen correcto (estancia destino)
  reason: z.string().max(500).optional(),
});

export const cancelSaleSchema = z.object({
  reason: z.string().max(500).optional(),
});

/** Anular UNA línea de la venta (corrección administrativa; conserva la línea como ANULADA). */
export const voidLineSchema = z.object({
  itemId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export type CreateSaleDto = z.infer<typeof createSaleSchema>;
export type CorrectSaleDto = z.infer<typeof correctSaleSchema>;
export type CorrectPaymentsDto = z.infer<typeof correctPaymentsSchema>;
export type CorrectSaleLinesDto = z.infer<typeof correctSaleLinesSchema>;
