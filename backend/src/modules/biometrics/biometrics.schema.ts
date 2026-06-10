import { z } from 'zod';

export const createDeviceSchema = z.object({
  name: z.string().min(1).max(120),
  ip: z.string().min(7).max(45),
  port: z.coerce.number().int().min(1).max(65535).default(4370),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export const enrollSchema = z.object({
  userId: z.string().uuid(),
  deviceUserId: z.string().min(1).max(40),
  name: z.string().max(120).optional().or(z.literal('')),
});

export type CreateDeviceDto = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceDto = z.infer<typeof updateDeviceSchema>;
export type EnrollDto = z.infer<typeof enrollSchema>;
