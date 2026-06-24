import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  branchId: z.string().min(1).optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional().or(z.literal('')),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
