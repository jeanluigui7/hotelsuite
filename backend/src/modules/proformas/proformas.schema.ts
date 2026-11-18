import { z } from 'zod';

export const createProformaSchema = z.object({
  cliente: z.string().min(1).max(160),
  telefono: z.string().max(30).optional().nullable(),
  habitaciones: z.coerce.number().int().min(1).default(1),
  total: z.coerce.number().min(0).optional().nullable(),
  validezDias: z.coerce.number().int().min(1).max(365).default(7),
});

export const convertProformaSchema = z.object({
  reservationId: z.string().min(1),
});

export type CreateProformaDto = z.infer<typeof createProformaSchema>;
export type ConvertProformaDto = z.infer<typeof convertProformaSchema>;
