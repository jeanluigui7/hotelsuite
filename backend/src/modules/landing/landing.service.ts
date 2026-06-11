import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

const WELCOME_KEY = 'landing.welcome';

export const updateLandingSchema = z.object({
  welcome: z.string().max(1000).optional().or(z.literal('')),
});
export type UpdateLandingDto = z.infer<typeof updateLandingSchema>;

export const landingService = {
  async getConfig(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const setting = await prisma.setting.findUnique({
      where: { branchId_key: { branchId, key: WELCOME_KEY } },
    });
    return { branchId, welcome: setting?.value ?? '' };
  },

  async updateConfig(scope: RequestScope, dto: UpdateLandingDto) {
    const branchId = requireActiveBranch(scope);
    const value = dto.welcome ?? '';
    await prisma.setting.upsert({
      where: { branchId_key: { branchId, key: WELCOME_KEY } },
      update: { value },
      create: { branchId, key: WELCOME_KEY, value },
    });
    return { branchId, welcome: value };
  },
};
