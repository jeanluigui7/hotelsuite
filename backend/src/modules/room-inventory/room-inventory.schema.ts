import { z } from 'zod';

export const saveInitialSchema = z.object({
  note: z.string().max(300).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        articleKind: z.string().min(1).max(30),
        category: z.string().max(120).optional().or(z.literal('')),
        quantity: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
});

export const loadBaseSchema = z.object({ note: z.string().max(300).optional().or(z.literal('')) });

// Dotación de habitación: prendas de ropa (del piso) y/o amenities (de AMENITIES - LIMPIEZA).
export const doteLinenSchema = z
  .object({
    items: z.array(z.object({ linenItemId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).optional().default([]),
    amenities: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).optional().default([]),
    note: z.string().max(300).optional().or(z.literal('')),
  })
  .refine((v) => v.items.length > 0 || v.amenities.length > 0, { message: 'Indica al menos una prenda o amenity a dotar' });

export type SaveInitialDto = z.infer<typeof saveInitialSchema>;
export type LoadBaseDto = z.infer<typeof loadBaseSchema>;
export type DoteLinenDto = z.infer<typeof doteLinenSchema>;
