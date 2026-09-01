import { z } from 'zod';

export const openCashSchema = z.object({
  openingAmount: z.coerce.number().min(0).default(0),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const closeCashSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: z.string().max(300).optional().or(z.literal('')),
  // Conteo por denominaciones del cierre (se persiste para reimprimir el ticket de caja ciega).
  denominations: z.array(z.object({ value: z.coerce.number().positive(), qty: z.coerce.number().int().min(0) })).optional(),
});

const methodEnum = z.enum(['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET']);
const categoryEnum = z.enum(['MOVEMENT', 'EXTRAORDINARY']);

export const movementSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  amount: z.coerce.number().positive(),
  concept: z.string().min(1).max(200),
  method: methodEnum.optional(),
  reference: z.string().max(200).optional().or(z.literal('')),
  note: z.string().max(500).optional().or(z.literal('')),
  category: categoryEnum.optional(),
});

export const updateMovementSchema = z.object({
  type: z.enum(['IN', 'OUT']).optional(),
  amount: z.coerce.number().positive().optional(),
  concept: z.string().min(1).max(200).optional(),
  method: methodEnum.optional(),
  reference: z.string().max(200).optional().or(z.literal('')),
  note: z.string().max(500).optional().or(z.literal('')),
  category: categoryEnum.optional(),
  reason: z.string().max(500).optional(),
});

export const voidMovementSchema = z.object({
  reason: z.string().max(500).optional(),
});

// Regularizar/cobrar una DEUDA desde los movimientos de caja (aunque la estancia ya terminó y la
// caja esté cerrada). saleId = deuda de una venta existente; stayId = estancia sin cargo registrado.
export const regularizeDebtSchema = z
  .object({
    saleId: z.string().min(1).optional(),
    stayId: z.string().min(1).optional(),
    method: methodEnum,
    amount: z.coerce.number().positive(),
    reference: z.string().max(120).optional().or(z.literal('')),
  })
  .refine((v) => !!v.saleId || !!v.stayId, { message: 'Indica la venta o la estancia a regularizar', path: ['saleId'] });

export const frequentConceptsSchema = z.object({
  concepts: z.array(z.string().min(1).max(120)).max(50),
});

export type OpenCashDto = z.infer<typeof openCashSchema>;
export type CloseCashDto = z.infer<typeof closeCashSchema>;
export type MovementDto = z.infer<typeof movementSchema>;
export type UpdateMovementDto = z.infer<typeof updateMovementSchema>;
export type FrequentConceptsDto = z.infer<typeof frequentConceptsSchema>;
