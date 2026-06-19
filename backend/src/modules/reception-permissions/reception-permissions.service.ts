import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

/** Permisos de recepción configurables por el administrador (por sucursal). */
const KEYS = {
  allowChangeRoom: 'reception.allowChangeRoom',
  allowWriteOff: 'reception.allowWriteOff',
  allowViewCash: 'reception.allowViewCash',
} as const;

export const updateReceptionPermsSchema = z.object({
  allowChangeRoom: z.boolean().optional(),
  allowWriteOff: z.boolean().optional(),
  allowViewCash: z.boolean().optional(),
});
export type UpdateReceptionPermsDto = z.infer<typeof updateReceptionPermsSchema>;

async function read(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}
async function write(branchId: string, key: string, value: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { branchId_key: { branchId, key } },
    update: { value: value ? 'true' : 'false' },
    create: { branchId, key, value: value ? 'true' : 'false' },
  });
}

export const receptionPermsService = {
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [cr, wo, vc] = await Promise.all([
      read(branchId, KEYS.allowChangeRoom),
      read(branchId, KEYS.allowWriteOff),
      read(branchId, KEYS.allowViewCash),
    ]);
    return {
      allowChangeRoom: cr === 'true',
      allowWriteOff: wo === 'true',
      allowViewCash: vc == null ? true : vc === 'true', // ver caja: habilitado por defecto
    };
  },
  async update(scope: RequestScope, dto: UpdateReceptionPermsDto) {
    const branchId = requireActiveBranch(scope);
    if (dto.allowChangeRoom !== undefined) await write(branchId, KEYS.allowChangeRoom, dto.allowChangeRoom);
    if (dto.allowWriteOff !== undefined) await write(branchId, KEYS.allowWriteOff, dto.allowWriteOff);
    if (dto.allowViewCash !== undefined) await write(branchId, KEYS.allowViewCash, dto.allowViewCash);
    return this.get(scope);
  },
};
