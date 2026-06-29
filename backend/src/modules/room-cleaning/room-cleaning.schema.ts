import { z } from 'zod';

export const INCIDENCIAS = ['OK', 'MANCHADA', 'DANADA', 'FALTANTE'] as const;

export const retiroSchema = z.object({
  note: z.string().max(300).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        articleKind: z.string().min(1).max(30),
        quantity: z.coerce.number().int().min(1),
        incidencia: z.enum(INCIDENCIAS).default('OK'),
      }),
    )
    .min(1),
});

export const reposicionSchema = z.object({
  note: z.string().max(300).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        articleKind: z.string().min(1).max(30),
        quantity: z.coerce.number().int().min(1),
        // Vínculo opcional al artículo de ropa legado: si viene, descuenta el almacén del piso.
        linenItemId: z.string().min(1).optional().or(z.literal('')),
      }),
    )
    .min(1),
});

export const finalizarSchema = z.object({
  exception: z
    .object({ motivo: z.string().min(1).max(300), autorizadoPor: z.string().min(1).max(120) })
    .optional(),
});

export type RetiroDto = z.infer<typeof retiroSchema>;
export type ReposicionDto = z.infer<typeof reposicionSchema>;
export type FinalizarDto = z.infer<typeof finalizarSchema>;
