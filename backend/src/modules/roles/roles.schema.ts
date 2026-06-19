import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(250).optional(),
  permissionIds: z.array(z.string().min(1)).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(250).optional(),
  permissionIds: z.array(z.string().min(1)).optional(),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
