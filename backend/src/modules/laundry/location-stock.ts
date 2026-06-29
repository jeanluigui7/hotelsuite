import type { Prisma } from '@prisma/client';

export const LOCATIONS = {
  DIRTY: 'Ropa Sucia Pendiente',
  LAUNDRY: 'Lavandería',
  CLEAN_CENTRAL: 'Almacén de Ropa Limpia Central',
} as const;

export type LocationCode = keyof typeof LOCATIONS;

/** Ajusta (suma/resta) el stock de una ubicación no-habitación, sin bajar de 0. */
export async function addLocationStock(
  tx: Prisma.TransactionClient,
  branchId: string,
  location: LocationCode,
  articleKind: string,
  name: string,
  delta: number,
  linenItemId?: string | null,
): Promise<void> {
  const key = { branchId_location_articleKind_name: { branchId, location, articleKind, name } };
  const existing = await tx.linenLocationStock.findUnique({ where: key });
  const next = Math.max(0, (existing?.quantity ?? 0) + delta);
  await tx.linenLocationStock.upsert({
    where: key,
    update: { quantity: next, ...(linenItemId ? { linenItemId } : {}) },
    create: { branchId, location, articleKind, name, quantity: Math.max(0, delta), linenItemId: linenItemId ?? null },
  });
}
