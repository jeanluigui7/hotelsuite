/**
 * Siembra inventario de ropa (linen) para TODAS las sucursales que aún no lo
 * tengan configurado. El perfil de Limpieza ve la ropa por piso vía
 * GET /cleaning/linen-inventory (filtra por sucursal activa), por lo que cada
 * sucursal necesita su propio catálogo + stock por piso.
 *
 * - Catálogo estándar: toallas (blanca/color), sábanas (blanca/color),
 *   edredón y amenities (jabón/shampoo).
 * - Los pisos se derivan de las habitaciones reales de la sucursal (Room.floor);
 *   si la sucursal no tiene pisos definidos, se usa el piso "1".
 * - Idempotente: IDs derivados de la sucursal (upsert). Las sucursales que ya
 *   tienen ropa (p.ej. RIZZOS) se omiten para no duplicar su catálogo.
 *
 *   npx tsx prisma/seed-linen.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Catálogo estándar de ropa por sucursal. `rem` = cantidad inicial por piso. */
const CATALOG: { key: string; type: string; name: string; color: string; reusable: boolean; rem: number }[] = [
  { key: 'toa-blanca', type: 'TOALLA', name: 'Blanca', color: '#ffffff', reusable: true, rem: 12 },
  { key: 'toa-color', type: 'TOALLA', name: 'Color', color: '#ff7f6b', reusable: true, rem: 12 },
  { key: 'sab-blanca', type: 'SABANA', name: 'Blanca', color: '#ffffff', reusable: true, rem: 12 },
  { key: 'sab-color', type: 'SABANA', name: 'Color', color: '#3b82f6', reusable: true, rem: 12 },
  { key: 'edr-beige', type: 'EDREDON', name: 'Beige', color: '#d6c7a1', reusable: false, rem: 4 },
  { key: 'amn-jabon', type: 'AMENITY', name: 'Jabón', color: '#fcd34d', reusable: false, rem: 6 },
  { key: 'amn-shampoo', type: 'AMENITY', name: 'Shampoo sachet', color: '#a78bfa', reusable: false, rem: 6 },
];

/** Pisos de la sucursal a partir de sus habitaciones; fallback al piso "1". */
async function floorsForBranch(branchId: string): Promise<string[]> {
  const rooms = await prisma.room.findMany({ where: { branchId }, select: { floor: true } });
  const floors = [...new Set(rooms.map((r) => (r.floor ?? '').trim()).filter((f) => f.length > 0))];
  floors.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return floors.length ? floors : ['1'];
}

async function main(): Promise<void> {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  let seeded = 0;
  let skipped = 0;

  for (const branch of branches) {
    const existing = await prisma.linenItem.count({ where: { branchId: branch.id } });
    if (existing > 0) {
      skipped += 1;
      // eslint-disable-next-line no-console
      console.log(`↷ ${branch.name} (${branch.id}): ya tiene ${existing} item(s) de ropa, se omite.`);
      continue;
    }

    const floors = await floorsForBranch(branch.id);

    for (const c of CATALOG) {
      const itemId = `linen-${branch.id}-${c.key}`;
      await prisma.linenItem.upsert({
        where: { id: itemId },
        update: { name: c.name, color: c.color, reusable: c.reusable },
        create: { id: itemId, branchId: branch.id, type: c.type, name: c.name, color: c.color, reusable: c.reusable },
      });

      for (const floor of floors) {
        await prisma.linenStock.upsert({
          where: { linenItemId_floor: { linenItemId: itemId, floor } },
          update: {}, // no pisar ajustes manuales en re-ejecuciones
          create: { id: `${itemId}-p${floor}`, branchId: branch.id, linenItemId: itemId, floor, rem: c.rem, sum: 0 },
        });
      }
    }

    seeded += 1;
    // eslint-disable-next-line no-console
    console.log(`✅ ${branch.name} (${branch.id}): ${CATALOG.length} items × pisos [${floors.join(', ')}].`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nListo. Sucursales sembradas: ${seeded}, omitidas (ya tenían ropa): ${skipped}.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed de ropa falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
