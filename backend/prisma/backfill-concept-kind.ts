/**
 * Backfill controlado de SaleItem.conceptKind / courtesy (clasificación SERVICIOS/PENALIDADES).
 * Idempotente (solo toca filas con conceptKind NULL). NO re-cobra, re-entrega, descuenta inventario
 * ni duplica movimientos: solo escribe la clasificación en la línea.
 *
 * Prioridad (determinista por RELACIÓN con el concepto y la operación original):
 *  1) RoomSupply.saleItemId → ServiceConcept.group.category.tipo (+ courtesy de RoomSupply).
 *  2) Marcador de sistema "Tiempo extra / tiempo excedido / hora extra" (extensión por horas) → PENALTY.
 *  3) Coincidencia EXACTA y ÚNICA de la descripción con un ServiceConcept activo → su tipo.
 *  4) Ambiguo (sin relación ni coincidencia única) → NO se reclasifica; se REPORTA.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rxExtra = /tiempo extra|tiempo excedido|hora extra/i;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

async function main() {
  const items = await prisma.saleItem.findMany({ where: { conceptKind: null }, select: { id: true, description: true, productId: true, saleId: true } });
  const concepts = await prisma.serviceConcept.findMany({ select: { id: true, name: true, group: { select: { category: { select: { tipo: true } } } } } });
  // index: name normalizado → lista de {tipo}
  const byName = new Map<string, { tipo: string }[]>();
  for (const c of concepts) {
    const arr = byName.get(norm(c.name)) ?? [];
    arr.push({ tipo: c.group.category.tipo });
    byName.set(norm(c.name), arr);
  }

  let viaSupply = 0, viaExtra = 0, viaName = 0, ambiguous = 0, courtesySet = 0;
  const ambiguousSamples: string[] = [];

  for (const it of items) {
    let kind: 'SERVICE' | 'PENALTY' | null = null;
    let courtesy = false;

    // 1) Relación con RoomSupply (ropa adicional)
    const supply = await prisma.roomSupply.findFirst({ where: { saleItemId: it.id }, select: { conceptId: true, courtesy: true } });
    if (supply?.conceptId) {
      const c = await prisma.serviceConcept.findUnique({ where: { id: supply.conceptId }, select: { group: { select: { category: { select: { tipo: true } } } } } });
      if (c) { kind = c.group.category.tipo === 'PENALIDAD' ? 'PENALTY' : 'SERVICE'; courtesy = supply.courtesy; }
    }
    // 2) Marcador de horas extras / tiempo excedido
    if (!kind && !it.productId && rxExtra.test(it.description)) kind = 'PENALTY';
    // 3) Coincidencia exacta y única con un concepto activo
    if (!kind && !it.productId) {
      const matches = byName.get(norm(it.description));
      if (matches && matches.length === 1) kind = matches[0].tipo === 'PENALIDAD' ? 'PENALTY' : 'SERVICE';
    }

    if (!kind) {
      // Solo reportar las que PARECEN servicio/penalidad (sin productId y sin pinta de hospedaje/producto).
      if (!it.productId && !/^tarifa[:\s]|pernocta|renovaci|hospedaje|d[ií]a hotelero|early/i.test(it.description)) {
        ambiguous++; if (ambiguousSamples.length < 25) ambiguousSamples.push(`${it.id.slice(0, 8)} · "${it.description}"`);
      }
      continue;
    }
    await prisma.saleItem.update({ where: { id: it.id }, data: { conceptKind: kind, courtesy } });
    if (supply?.conceptId) viaSupply++; else if (rxExtra.test(it.description)) viaExtra++; else viaName++;
    if (courtesy) courtesySet++;
  }

  console.log(`[backfill conceptKind] total NULL=${items.length}`);
  console.log(`  via RoomSupply (relación): ${viaSupply}`);
  console.log(`  via "tiempo extra" (PENALTY): ${viaExtra}`);
  console.log(`  via nombre exacto único: ${viaName}`);
  console.log(`  courtesy marcadas: ${courtesySet}`);
  console.log(`  AMBIGUAS (no reclasificadas, revisar): ${ambiguous}`);
  for (const s of ambiguousSamples) console.log(`     · ${s}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
