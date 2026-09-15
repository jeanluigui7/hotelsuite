import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';
import { recordActivity } from '../activity-log/activity.emitter';

const FLAG_LABEL: Record<'allowChangeRoom' | 'allowWriteOff' | 'allowViewCash', string> = {
  allowChangeRoom: 'Cambiar habitación', allowWriteOff: 'Anular ventas / dar de baja', allowViewCash: 'Ver caja',
};

/** Permisos de recepción configurables por el administrador (por sucursal). */
const KEYS = {
  allowChangeRoom: 'reception.allowChangeRoom',
  allowWriteOff: 'reception.allowWriteOff',
  allowViewCash: 'reception.allowViewCash',
  declareStay: 'reception.declareStay',
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
    const [cr, wo, vc, ds] = await Promise.all([
      read(branchId, KEYS.allowChangeRoom),
      read(branchId, KEYS.allowWriteOff),
      read(branchId, KEYS.allowViewCash),
      read(branchId, KEYS.declareStay),
    ]);
    return {
      allowChangeRoom: cr === 'true',
      allowWriteOff: wo === 'true',
      allowViewCash: vc == null ? true : vc === 'true', // ver caja: habilitado por defecto
      declareStay: ds === 'true',
    };
  },
  async update(scope: RequestScope, dto: UpdateReceptionPermsDto) {
    const branchId = requireActiveBranch(scope);
    const before = await this.get(scope);
    if (dto.allowChangeRoom !== undefined) await write(branchId, KEYS.allowChangeRoom, dto.allowChangeRoom);
    if (dto.allowWriteOff !== undefined) await write(branchId, KEYS.allowWriteOff, dto.allowWriteOff);
    if (dto.allowViewCash !== undefined) await write(branchId, KEYS.allowViewCash, dto.allowViewCash);
    const after = await this.get(scope);
    // Un evento por cada flag que realmente cambió (concedido / retirado), con antes→después.
    (['allowChangeRoom', 'allowWriteOff', 'allowViewCash'] as const).forEach((k) => {
      if (dto[k] !== undefined && before[k] !== after[k]) {
        void recordActivity(scope, {
          activity: after[k] ? 'PERMISSION_GRANT' : 'PERMISSION_REVOKE', area: 'PERMISOS',
          reference: `Permiso · ${FLAG_LABEL[k]}`,
          detail: `Recepción · ${FLAG_LABEL[k]} ${after[k] ? 'concedido' : 'retirado'}`,
          meta: { flag: k, label: FLAG_LABEL[k], before: before[k], after: after[k] },
        });
      }
    });
    return after;
  },
};
