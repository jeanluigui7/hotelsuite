import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72), // bcrypt max input 72 bytes
  roleId: z.string().min(1),
  status: z.enum(['active', 'inactive']).default('active'),
  branchIds: z.array(z.string().min(1)).min(1, 'Asigne al menos una sucursal'),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(72).optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  branchIds: z.array(z.string().min(1)).min(1).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
