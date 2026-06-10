import { z } from 'zod';

export const createTaskSchema = z.object({
  roomId: z.string().uuid(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const completeTaskSchema = z.object({
  consumption: z
    .array(
      z.object({
        productId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .default([]),
});

export const inspectTaskSchema = z.object({
  approved: z.boolean(),
  items: z
    .array(
      z.object({
        checklistItemId: z.string().uuid(),
        passed: z.boolean(),
        note: z.string().max(200).optional().or(z.literal('')),
      }),
    )
    .default([]),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;
export type InspectTaskDto = z.infer<typeof inspectTaskSchema>;
