import { z } from 'zod';

export const createTaskSchema = z.object({
  roomId: z.string().min(1),
  assignedToUserId: z.string().min(1).optional().nullable(),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const completeTaskSchema = z.object({
  consumption: z
    .array(
      z.object({
        productId: z.string().min(1),
        warehouseId: z.string().min(1),
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
        checklistItemId: z.string().min(1),
        passed: z.boolean(),
        note: z.string().max(200).optional().or(z.literal('')),
      }),
    )
    .default([]),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;
export type InspectTaskDto = z.infer<typeof inspectTaskSchema>;
