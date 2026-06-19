import { z } from 'zod';

export const createReminderSchema = z.object({
  name: z.string().min(1).max(120),
  templateId: z.string().min(1).optional().nullable(),
  trigger: z.string().max(200).optional().or(z.literal('')),
  active: z.coerce.boolean().default(true),
});

export const updateReminderSchema = createReminderSchema.partial();

export type CreateReminderDto = z.infer<typeof createReminderSchema>;
export type UpdateReminderDto = z.infer<typeof updateReminderSchema>;
