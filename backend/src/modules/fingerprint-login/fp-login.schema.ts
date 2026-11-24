import { z } from 'zod';

export const loginModeSchema = z.object({ email: z.string().min(1).max(160) });
export const loginRequestSchema = z.object({ email: z.string().min(1).max(160) });
export const saveLoginConfigSchema = z.object({ roleIds: z.array(z.string().min(1)).max(100) });
export const setUserPinSchema = z.object({ pin: z.string().max(40) });

export type LoginModeDto = z.infer<typeof loginModeSchema>;
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;
export type SaveLoginConfigDto = z.infer<typeof saveLoginConfigSchema>;
export type SetUserPinDto = z.infer<typeof setUserPinSchema>;
