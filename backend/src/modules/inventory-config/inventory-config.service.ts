import { z } from 'zod';
import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { prisma } from '../../config/prisma';

const KEYS = {
  defaultWarehouseId: 'inventory.defaultWarehouseId',
  defaultReorderPoint: 'inventory.defaultReorderPoint',
  lowStockAlert: 'inventory.lowStockAlert',
} as const;

export const updateInventoryConfigSchema = z.object({
  defaultWarehouseId: z.string().uuid().nullable().optional(),
  defaultReorderPoint: z.coerce.number().int().min(0).optional(),
  lowStockAlert: z.boolean().optional(),
});
export type UpdateInventoryConfigDto = z.infer<typeof updateInventoryConfigSchema>;

async function readKey(branchId: string, key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key } } });
  return s?.value ?? null;
}

async function writeKey(branchId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { branchId_key: { branchId, key } },
    update: { value },
    create: { branchId, key, value },
  });
}

export const inventoryConfigService = {
  async get(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const [defaultWarehouseId, reorder, lowStock] = await Promise.all([
      readKey(branchId, KEYS.defaultWarehouseId),
      readKey(branchId, KEYS.defaultReorderPoint),
      readKey(branchId, KEYS.lowStockAlert),
    ]);
    return {
      defaultWarehouseId: defaultWarehouseId || null,
      defaultReorderPoint: reorder != null ? Number(reorder) : 0,
      lowStockAlert: lowStock === 'true',
    };
  },

  async update(scope: RequestScope, dto: UpdateInventoryConfigDto) {
    const branchId = requireActiveBranch(scope);
    if (dto.defaultWarehouseId !== undefined) {
      await writeKey(branchId, KEYS.defaultWarehouseId, dto.defaultWarehouseId ?? '');
    }
    if (dto.defaultReorderPoint !== undefined) {
      await writeKey(branchId, KEYS.defaultReorderPoint, String(dto.defaultReorderPoint));
    }
    if (dto.lowStockAlert !== undefined) {
      await writeKey(branchId, KEYS.lowStockAlert, dto.lowStockAlert ? 'true' : 'false');
    }
    return this.get(scope);
  },
};
