import { z } from 'zod';

const deviceType = z.enum(['mobile', 'tablet', 'desktop', 'other']);

export const updateDeviceAccessSchema = z.object({
  byRole: z.record(z.array(deviceType)),
});

export type UpdateDeviceAccessDto = z.infer<typeof updateDeviceAccessSchema>;
