import { z } from 'zod';

export const createAdvanceSchema = z.object({
  cliente: z.string().min(1).max(160),
  telefono: z.string().max(30).optional().nullable(),
  importe: z.coerce.number().positive(),
  medio: z.string().max(40).optional().nullable(),
  destino: z.string().max(120).optional().nullable(),
  operacion: z.string().max(120).optional().nullable(),
  referencia: z.string().max(160).optional().nullable(),
  observacion: z.string().max(300).optional().nullable(),
  fecha: z.coerce.date().optional(),
});

export const applyAdvanceSchema = z.object({
  reservationId: z.string().min(1),
  importe: z.coerce.number().positive(),
});

export type CreateAdvanceDto = z.infer<typeof createAdvanceSchema>;
export type ApplyAdvanceDto = z.infer<typeof applyAdvanceSchema>;
