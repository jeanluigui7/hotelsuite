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

// Dotación por PRENDA ESPECÍFICA: coloca ropa exacta en la habitación descontándola del piso.
export const doteLinenSchema = z.object({
  items: z
    .array(z.object({ linenItemId: z.string().min(1), quantity: z.coerce.number().int().min(1) }))
    .min(1),
  note: z.string().max(300).optional().or(z.literal('')),
});

export type SaveInitialDto = z.infer<typeof saveInitialSchema>;
export type LoadBaseDto = z.infer<typeof loadBaseSchema>;
export type DoteLinenDto = z.infer<typeof doteLinenSchema>;
