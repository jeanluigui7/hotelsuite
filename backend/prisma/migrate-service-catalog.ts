/**
 * Adaptación idempotente del catálogo Servicios/Penalidades (FASE 1).
 * - Crea las categorías y grupos iniciales (§11) que falten, por sucursal.
 * - Migra UNA sola vez los Item existentes (kind SERVICE → tipo SERVICIO; SERVICE_PENALTY → PENALIDAD)
 *   a la jerarquía Categoría → Grupo → Concepto, sin duplicar (guard por Setting).
 * No inventa precios ni conceptos: solo reutiliza datos reales. Seguro de correr varias veces.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIGRATED_KEY = 'serviceCatalog.itemsMigrated';

const INITIAL_CATEGORIES: Record<'SERVICIO' | 'PENALIDAD', string[]> = {
  SERVICIO: ['Gestión de estadía', 'Servicios a la habitación', 'Cafetería / Restaurante', 'Bar', 'Lavandería huéspedes', 'Servicios especiales', 'Servicios temporales'],
  PENALIDAD: ['Daños', 'Ropa faltante', 'Ropa dañada', 'Penalidades por tiempo', 'Penalidades por ocupación', 'Penalidades por consumo indebido', 'Penalidades administrativas'],
};
const INITIAL_GROUPS: Record<string, string[]> = {
  'Servicios a la habitación': ['Ropa adicional', 'Amenities adicionales', 'Limpieza adicional'],
  'Cafetería / Restaurante': ['Desayunos', 'Snacks dulces', 'Bebidas frías', 'Menú / Carta', 'Bebidas calientes'],
};

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

async function ensureCategory(branchId: string, tipo: 'SERVICIO' | 'PENALIDAD', name: string, sortOrder: number) {
  const existing = await prisma.serviceCategory.findMany({ where: { branchId, tipo } });
  const found = existing.find((c) => norm(c.name) === norm(name));
  if (found) return found;
  return prisma.serviceCategory.create({ data: { branchId, tipo, name, sortOrder } });
}

async function ensureGroup(branchId: string, categoryId: string, name: string, sortOrder: number) {
  const existing = await prisma.serviceGroup.findMany({ where: { categoryId } });
  const found = existing.find((g) => norm(g.name) === norm(name));
  if (found) return found;
  return prisma.serviceGroup.create({ data: { branchId, categoryId, name, sortOrder } });
}

async function uniqueCode(branchId: string, base: string): Promise<string> {
  const prefix = (base.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'SVC');
  for (let i = 1; i < 10000; i++) {
    const code = `${prefix}-${String(i).padStart(3, '0')}`;
    const clash = await prisma.serviceConcept.findFirst({ where: { branchId, code } });
    if (!clash) return code;
  }
  return `${prefix}-${Date.now()}`;
}

async function ensureConcept(branchId: string, groupId: string, name: string, price: number) {
  const existing = await prisma.serviceConcept.findMany({ where: { groupId } });
  if (existing.some((c) => norm(c.name) === norm(name))) return; // ya migrado
  const code = await uniqueCode(branchId, name);
  await prisma.serviceConcept.create({ data: { branchId, groupId, code, name, price, unit: 'UNIDAD' } });
}

async function migrateBranch(branchId: string) {
  // 1) Categorías iniciales (§11)
  for (const tipo of ['SERVICIO', 'PENALIDAD'] as const) {
    let i = 0;
    for (const name of INITIAL_CATEGORIES[tipo]) await ensureCategory(branchId, tipo, name, i++);
  }
  // 2) Grupos iniciales de categorías específicas
  const servCats = await prisma.serviceCategory.findMany({ where: { branchId, tipo: 'SERVICIO' } });
  for (const [catName, groups] of Object.entries(INITIAL_GROUPS)) {
    const cat = servCats.find((c) => norm(c.name) === norm(catName));
    if (!cat) continue;
    let i = 0;
    for (const g of groups) await ensureGroup(branchId, cat.id, g, i++);
  }

  // 3) Migración única de los Item existentes
  const flag = await prisma.setting.findUnique({ where: { branchId_key: { branchId, key: MIGRATED_KEY } } });
  if (flag?.value === 'true') return { migrated: 0, skipped: true };

  let migrated = 0;
  const map: { kind: string; tipo: 'SERVICIO' | 'PENALIDAD' }[] = [
    { kind: 'SERVICE', tipo: 'SERVICIO' },
    { kind: 'SERVICE_PENALTY', tipo: 'PENALIDAD' },
  ];
  for (const { kind, tipo } of map) {
    const items = await prisma.item.findMany({ where: { branchId, kind } });
    for (const it of items) {
      const catName = (it.subcategory && it.subcategory.trim()) || 'General';
      const cat = await ensureCategory(branchId, tipo, catName, 99);
      const group = await ensureGroup(branchId, cat.id, 'General', 0);
      await ensureConcept(branchId, group.id, it.name, it.price != null ? Number(it.price) : 0);
      migrated++;
    }
  }
  await prisma.setting.upsert({
    where: { branchId_key: { branchId, key: MIGRATED_KEY } },
    create: { branchId, key: MIGRATED_KEY, value: 'true' },
    update: { value: 'true' },
  });
  return { migrated, skipped: false };
}

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  for (const b of branches) {
    const r = await migrateBranch(b.id);
    console.log(`[service-catalog] ${b.name} (${b.id}): initial scaffolding OK · items ${r.skipped ? 'ya migrados' : `migrados=${r.migrated}`}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
