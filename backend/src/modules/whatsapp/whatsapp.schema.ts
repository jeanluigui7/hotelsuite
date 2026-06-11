import { z } from 'zod';

export const createInstanceSchema = z.object({
  name: z.string().min(1).max(120),
  provider: z.enum(['mock', 'cloud', 'twilio']).default('mock'),
  phoneNumber: z.string().max(30).optional().or(z.literal('')),
  config: z.string().max(2000).optional().or(z.literal('')),
});
export const updateInstanceSchema = createInstanceSchema.partial();

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  status: z.enum(['active', 'inactive']).default('active'),
});
export const updateTemplateSchema = createTemplateSchema.partial();

export const sendSchema = z.object({
  templateId: z.string().uuid().optional(),
  body: z.string().max(2000).optional(),
  to: z.string().min(3).max(30),
  variables: z.record(z.string(), z.string()).default({}),
});

export type CreateInstanceDto = z.infer<typeof createInstanceSchema>;
export type UpdateInstanceDto = z.infer<typeof updateInstanceSchema>;
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;
export type SendDto = z.infer<typeof sendSchema>;
