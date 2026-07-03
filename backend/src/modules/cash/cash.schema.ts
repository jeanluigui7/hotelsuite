import { z } from 'zod';

export const openCashSchema = z.object({
  openingAmount: z.coerce.number().min(0).default(0),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const closeCashSchema = z.object({
  closingAmount: z.coerce.number().min(0),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const movementSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  amount: z.coerce.number().positive(),
  concept: z.string().min(1).max(200),
});

export const updateMovementSchema = z.object({
  type: z.enum(['IN', 'OUT']).optional(),
  amount: z.coerce.number().positive().optional(),
  concept: z.string().min(1).max(200).optional(),
});

export type OpenCashDto = z.infer<typeof openCashSchema>;
export type CloseCashDto = z.infer<typeof closeCashSchema>;
export type MovementDto = z.infer<typeof movementSchema>;
export type UpdateMovementDto = z.infer<typeof updateMovementSchema>;
