import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { ForbiddenError } from '../../shared/errors';
import { prisma } from '../../config/prisma';

/**
 * Configuración operativa de la sucursal activa (una sola pantalla).
 * Fuente única de verdad: reutiliza las mismas claves de `pernocta` y `reception-permissions`
 * en la tabla Setting (por sucursal), más claves nuevas con prefijo `ops.` / `cleaning.`.
 * La "Caja ciega" se deriva de Branch.adminPresent (blindCash = !adminPresent) para no duplicar.
 */
const KEYS = {
  // Reutilizados (no duplicar): pernoctación y permisos de recepción existentes.
  cutoffHour: 'pernocta.checkOutHour', // Hora de corte de la pernoctación
  recRoomChange: 'reception.allowChangeRoom',
  recProductWriteoff: 'reception.allowWriteOff',
  // Nuevos
  recDeclareStay: 'reception.declareStay',
  recCreditNote: 'reception.creditNote',
  reservaMargin: 'ops.reservaMarginMin',
  minPrice: 'ops.minPriceEnabled',
  commissions: 'ops.commissionsEnabled',
  pos: 'ops.pos', // JSON: { transfer/yape/plin/credit/debit: { enabled, pct } }
  cleaningTime: 'ops.cleaningTimeLimitMin',
  inspection: 'ops.inspectionEnabled',
  preCheckout: 'ops.preCheckoutEnabled',
  stockAlertEvery: 'ops.stockAlertEveryHours',
  linenWriteoff: 'cleaning.linenWriteoff',
} as const;

const posMethodSchema = z.object({ enabled: z.boolean(), pct: z.coerce.number().min(0).max(100) });
const posSchema = z.object({
  transfer: posMethodSchema,
  yape: posMethodSchema,
  plin: posMethodSchema,
  credit: posMethodSchema,
  debit: posMethodSchema,
});
type Pos = z.infer<typeof posSchema>;

const DEFAULT_POS: Pos = {
  transfer: { enabled: false, pct: 0 },
  yape: { enabled: false, pct: 0 },
  plin: { enabled: false, pct: 0 },
  credit: { enabled: false, pct: 5 },
  debit: { enabled: false, pct: 5 },
};

export const updateOperationsConfigSchema = z.object({
  blindCash: z.boolean().optional(),
  cutoffHour: z.coerce.number().int().min(0).max(23).optional(),
  reservaMarginMin: z.coerce.number().int().min(0).max(1440).optional(),
  minPriceEnabled: z.boolean().optional(),
  commissionsEnabled: z.boolean().optional(),
  pos: posSchema.optional(),
  cleaningTimeLimitMin: z.coerce.number().int().min(0).max(600).optional(),
  inspectionEnabled: z.boolean().optional(),
  preCheckoutEnabled: z.boolean().optional(),
  stockAlertEveryHours: z.coerce.number().int().min(0).max(720).optional(),
  reception: z
    .object({
      declareStay: z.boolean().optional(),
      roomChange: z.boolean().optional(),
      productWriteoff: z.boolean().optional(),
      creditNote: z.boolean().optional(),
    })
    .optional(),
  cleaning: z.object({ linenWriteoff: z.boolean().optional() }).optional(),
});
export type UpdateOperationsConfigDto = z.infer<typeof updateOperationsConfigSchema>;

async function read(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}
async function write(branchId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { branchId_key: { branchId, key } },
    update: { value },
    create: { branchId, key, value },
  });
}
const bool = (v: string | null, def: boolean) => (v == null ? def : v === 'true');
const num = (v: string | null, def: number) => (v == null || v === '' ? def : Number(v));

export const operationsConfigService = {
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, adminPresent: true } });
    const [cutoff, resv, minP, comm, posRaw, cTime, insp, preCo, stock, recRoom, recProd, recDeclare, recNote, linen] = await Promise.all([
      read(branchId, KEYS.cutoffHour),
      read(branchId, KEYS.reservaMargin),
      read(branchId, KEYS.minPrice),
      read(branchId, KEYS.commissions),
      read(branchId, KEYS.pos),
      read(branchId, KEYS.cleaningTime),
      read(branchId, KEYS.inspection),
      read(branchId, KEYS.preCheckout),
      read(branchId, KEYS.stockAlertEvery),
      read(branchId, KEYS.recRoomChange),
      read(branchId, KEYS.recProductWriteoff),
      read(branchId, KEYS.recDeclareStay),
      read(branchId, KEYS.recCreditNote),
      read(branchId, KEYS.linenWriteoff),
    ]);
    let pos: Pos = DEFAULT_POS;
    if (posRaw) {
      const parsed = posSchema.safeParse(JSON.parse(posRaw));
      if (parsed.success) pos = parsed.data;
    }
    return {
      branchName: branch?.name ?? '',
      blindCash: !(branch?.adminPresent ?? true),
      cutoffHour: num(cutoff, 12),
      reservaMarginMin: num(resv, 60),
      minPriceEnabled: bool(minP, false),
      commissionsEnabled: bool(comm, false),
      pos,
      cleaningTimeLimitMin: num(cTime, 12),
      inspectionEnabled: bool(insp, true),
      preCheckoutEnabled: bool(preCo, false),
      stockAlertEveryHours: num(stock, 24),
      reception: {
        declareStay: bool(recDeclare, false),
        roomChange: bool(recRoom, false),
        productWriteoff: bool(recProd, false),
        creditNote: bool(recNote, false),
      },
      cleaning: { linenWriteoff: bool(linen, false) },
    };
  },

  async update(scope: RequestScope, dto: UpdateOperationsConfigDto) {
    const branchId = requireActiveBranch(scope);
    const b = (v: boolean) => (v ? 'true' : 'false');

    if (dto.blindCash !== undefined) await prisma.branch.update({ where: { id: branchId }, data: { adminPresent: !dto.blindCash } });
    if (dto.cutoffHour !== undefined) await write(branchId, KEYS.cutoffHour, String(dto.cutoffHour));
    if (dto.reservaMarginMin !== undefined) await write(branchId, KEYS.reservaMargin, String(dto.reservaMarginMin));
    if (dto.minPriceEnabled !== undefined) await write(branchId, KEYS.minPrice, b(dto.minPriceEnabled));
    if (dto.commissionsEnabled !== undefined) await write(branchId, KEYS.commissions, b(dto.commissionsEnabled));
    if (dto.pos !== undefined) await write(branchId, KEYS.pos, JSON.stringify(dto.pos));
    if (dto.cleaningTimeLimitMin !== undefined) await write(branchId, KEYS.cleaningTime, String(dto.cleaningTimeLimitMin));
    if (dto.inspectionEnabled !== undefined) await write(branchId, KEYS.inspection, b(dto.inspectionEnabled));
    if (dto.preCheckoutEnabled !== undefined) await write(branchId, KEYS.preCheckout, b(dto.preCheckoutEnabled));
    if (dto.stockAlertEveryHours !== undefined) await write(branchId, KEYS.stockAlertEvery, String(dto.stockAlertEveryHours));
    if (dto.reception?.roomChange !== undefined) await write(branchId, KEYS.recRoomChange, b(dto.reception.roomChange));
    if (dto.reception?.productWriteoff !== undefined) await write(branchId, KEYS.recProductWriteoff, b(dto.reception.productWriteoff));
    if (dto.reception?.declareStay !== undefined) await write(branchId, KEYS.recDeclareStay, b(dto.reception.declareStay));
    if (dto.reception?.creditNote !== undefined) await write(branchId, KEYS.recCreditNote, b(dto.reception.creditNote));
    if (dto.cleaning?.linenWriteoff !== undefined) await write(branchId, KEYS.linenWriteoff, b(dto.cleaning.linenWriteoff));

    return this.get(scope);
  },
};

/** Administración (CEO/Gerente/Admin) conserva acceso independientemente de los switches. */
function isAdminScope(scope: RequestScope): boolean {
  return scope.isSuperAdmin || scope.permissions.includes('settings:edit');
}

/**
 * Exige que un permiso operativo de Recepción esté habilitado en la sucursal activa.
 * Administración siempre pasa. Lanza ForbiddenError si el rol no-admin no lo tiene habilitado.
 */
export async function requireReceptionFlag(
  scope: RequestScope,
  flag: 'declareStay' | 'roomChange' | 'productWriteoff' | 'creditNote',
  message: string,
): Promise<void> {
  if (isAdminScope(scope)) return;
  const cfg = await operationsConfigService.get(scope);
  if (!cfg.reception[flag]) throw new ForbiddenError(message);
}
