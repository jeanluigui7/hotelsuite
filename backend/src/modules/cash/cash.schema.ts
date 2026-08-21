import { z } from 'zod';

export const openCashSchema = z.object({
  openingAmount: z.coerce.number().min(0).default(0),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const closeCashSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: z.string().max(300).optional().or(z.literal('')),
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
});

export const frequentConceptsSchema = z.object({
  concepts: z.array(z.string().min(1).max(120)).max(50),
});

export type OpenCashDto = z.infer<typeof openCashSchema>;
export type CloseCashDto = z.infer<typeof closeCashSchema>;
export type MovementDto = z.infer<typeof movementSchema>;
export type UpdateMovementDto = z.infer<typeof updateMovementSchema>;
export type FrequentConceptsDto = z.infer<typeof frequentConceptsSchema>;
