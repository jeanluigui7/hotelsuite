import { z } from 'zod';

export const createWifiSchema = z.object({
  ssid: z.string().min(1).max(120),
  password: z.string().min(1).max(120),
  voucher: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(250).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateWifiSchema = createWifiSchema.partial();

export type CreateWifiDto = z.infer<typeof createWifiSchema>;
export type UpdateWifiDto = z.infer<typeof updateWifiSchema>;
