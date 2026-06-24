/**
 * Segunda sucursal de demostración: "RIZZOS Express" (rz-branch-0002).
 *
 * Demuestra la separación multi-sucursal: tipos de habitación, habitaciones, tarifas,
 * productos, stock y ropa DISTINTOS a la sucursal RIZZOS. Datos limpios (todas las
 * habitaciones disponibles), listos para flujos por sucursal.
 *
 * Requiere `prisma/seed.ts` (roles) y haber creado los usuarios demo (demo-rizzos.ts).
 * Idempotente.  npx tsx prisma/demo-sucursal2.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const B2 = 'rz-branch-0002';

async function main(): Promise<void> {
  // 1. Sucursal
  await prisma.branch.upsert({
    where: { id: B2 },
    update: { name: 'RIZZOS Express' },
    create: { id: B2, name: 'RIZZOS Express', address: 'Av. Los Olivos 456', currency: 'PEN', cutoffHour: 6 },
  });

  // 2. Acceso de los usuarios demo a esta sucursal (para poder cambiar de sucursal)
  for (const email of ['admin@hotelsuite.local', 'recepcion@rizzos.local', 'limpieza@rizzos.local', 'gerente@rizzos.local']) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) await prisma.userBranch.upsert({ where: { userId_branchId: { userId: u.id, branchId: B2 } }, update: {}, create: { userId: u.id, branchId: B2 } });
  }
  const recep = await prisma.user.findUnique({ where: { email: 'recepcion@rizzos.local' } });
  const limp = await prisma.user.findUnique({ where: { email: 'limpieza@rizzos.local' } });

  // 3. Tipos de habitación DISTINTOS (Individual / Suite Ejecutiva)
  const types = [
    { id: 'b2-rt-ind', name: 'Individual', capacity: 1, basePrice: 45 },
    { id: 'b2-rt-suite', name: 'Suite Ejecutiva', capacity: 3, basePrice: 140 },
  ];
  for (const t of types) {
    await prisma.roomType.upsert({
      where: { id: t.id }, update: { name: t.name, capacity: t.capacity, basePrice: t.basePrice },
      create: { id: t.id, branchId: B2, name: t.name, capacity: t.capacity, basePrice: t.basePrice },
    });
  }

  // 4. Tarifas por tipo (precios/duraciones distintos)
  const rates = [
    { roomTypeId: 'b2-rt-ind', label: '2 horas', durationMinutes: 120, price: 25 },
    { roomTypeId: 'b2-rt-ind', label: '12 horas', durationMinutes: 720, price: 40 },
    { roomTypeId: 'b2-rt-ind', label: 'DIA HOTELERO', durationMinutes: 1440, price: 45 },
    { roomTypeId: 'b2-rt-suite', label: '3 horas', durationMinutes: 180, price: 70 },
    { roomTypeId: 'b2-rt-suite', label: '12 horas', durationMinutes: 720, price: 110 },
    { roomTypeId: 'b2-rt-suite', label: 'DIA HOTELERO', durationMinutes: 1440, price: 140 },
  ];
  for (const r of rates) {
    await prisma.rate.upsert({
      where: { branchId_roomTypeId_durationMinutes: { branchId: B2, roomTypeId: r.roomTypeId, durationMinutes: r.durationMinutes } },
      update: { label: r.label, price: r.price, status: 'active' },
      create: { branchId: B2, roomTypeId: r.roomTypeId, label: r.label, durationMinutes: r.durationMinutes, price: r.price, status: 'active' },
    });
  }

  // 5. Habitaciones (numeración distinta) — todas disponibles
  const rooms = [
    { id: 'b2-room-a101', number: 'A-101', floor: '1', roomTypeId: 'b2-rt-ind' },
    { id: 'b2-room-a102', number: 'A-102', floor: '1', roomTypeId: 'b2-rt-ind' },
    { id: 'b2-room-b201', number: 'B-201', floor: '2', roomTypeId: 'b2-rt-suite' },
    { id: 'b2-room-b202', number: 'B-202', floor: '2', roomTypeId: 'b2-rt-suite' },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id }, update: { number: r.number, floor: r.floor, status: 'FREE' },
      create: { id: r.id, branchId: B2, roomTypeId: r.roomTypeId, number: r.number, floor: r.floor, status: 'FREE' },
    });
  }

  // 6. Tier de cliente
  await prisma.clientTier.upsert({
    where: { id: 'b2-tier-vip' }, update: { name: 'VIP', discountPercent: 12 },
    create: { id: 'b2-tier-vip', branchId: B2, name: 'VIP', discountPercent: 12, description: 'Cliente VIP Express' },
  });

  // 7. Categorías + productos DISTINTOS + stock central
  const cats = [{ id: 'b2-cat-snacks', name: 'Snacks' }, { id: 'b2-cat-cervezas', name: 'Cervezas' }];
  for (const c of cats) await prisma.inventoryCategory.upsert({ where: { id: c.id }, update: { name: c.name }, create: { id: c.id, branchId: B2, name: c.name } });
  await prisma.warehouse.upsert({ where: { id: 'b2-wh-prod' }, update: { name: 'Productos' }, create: { id: 'b2-wh-prod', branchId: B2, name: 'Productos', type: 'PRODUCTS' } });
  await prisma.warehouse.upsert({ where: { id: 'b2-wh-rec' }, update: { name: 'Recepción' }, create: { id: 'b2-wh-rec', branchId: B2, name: 'Recepción', type: 'RECEPTION' } });
  const prods = [
    { id: 'b2-p-pringles', sku: 'EXP-001', name: 'Pringles Original', cat: 'b2-cat-snacks', venta: 8, compra: 5, stock: 24, reorder: 6 },
    { id: 'b2-p-doritos', sku: 'EXP-002', name: 'Doritos', cat: 'b2-cat-snacks', venta: 5, compra: 3, stock: 30, reorder: 8 },
    { id: 'b2-p-mani', sku: 'EXP-003', name: 'Maní Salado', cat: 'b2-cat-snacks', venta: 3, compra: 1.5, stock: 40, reorder: 10 },
    { id: 'b2-p-pilsen', sku: 'EXP-010', name: 'Pilsen Callao', cat: 'b2-cat-cervezas', venta: 7, compra: 4, stock: 48, reorder: 12 },
    { id: 'b2-p-cusquena', sku: 'EXP-011', name: 'Cusqueña', cat: 'b2-cat-cervezas', venta: 8, compra: 4.5, stock: 36, reorder: 10 },
    { id: 'b2-p-corona', sku: 'EXP-012', name: 'Corona', cat: 'b2-cat-cervezas', venta: 10, compra: 6, stock: 24, reorder: 6 },
  ];
  for (const p of prods) {
    await prisma.product.upsert({
      where: { id: p.id }, update: { name: p.name, sku: p.sku, salePrice: p.venta, cost: p.compra, reorderPoint: p.reorder, categoryId: p.cat },
      create: { id: p.id, branchId: B2, name: p.name, sku: p.sku, salePrice: p.venta, cost: p.compra, reorderPoint: p.reorder, categoryId: p.cat },
    });
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: p.id, warehouseId: 'b2-wh-prod' } }, update: { quantity: p.stock },
      create: { productId: p.id, warehouseId: 'b2-wh-prod', quantity: p.stock },
    });
  }
  // Stock inicial en recepción (distinto)
  const recStock: Record<string, number> = { 'b2-p-pringles': 6, 'b2-p-pilsen': 12, 'b2-p-corona': 6, 'b2-p-doritos': 8 };
  for (const [pid, q] of Object.entries(recStock)) {
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: pid, warehouseId: 'b2-wh-rec' } }, update: { quantity: q },
      create: { productId: pid, warehouseId: 'b2-wh-rec', quantity: q },
    });
  }

  // 8. Ropa DISTINTA + almacén central (ALMACEN) + remanente por piso
  const linen = [
    { id: 'b2-li-toa-azul', type: 'TOALLA', name: 'Azul Marino', color: '#1e3a8a', reusable: true },
    { id: 'b2-li-sab-gris', type: 'SABANA', name: 'Gris Perla', color: '#9ca3af', reusable: true },
    { id: 'b2-li-edr-negro', type: 'EDREDON', name: 'Negro Ejecutivo', color: '#111827', reusable: true },
    { id: 'b2-li-amn-gel', type: 'AMENITY', name: 'Gel de baño', color: '#10b981', reusable: false },
  ];
  for (const l of linen) {
    await prisma.linenItem.upsert({
      where: { id: l.id }, update: { name: l.name, color: l.color, reusable: l.reusable },
      create: { id: l.id, branchId: B2, type: l.type, name: l.name, color: l.color, reusable: l.reusable },
    });
    await prisma.linenStock.upsert({
      where: { linenItemId_floor: { linenItemId: l.id, floor: 'ALMACEN' } }, update: { rem: 40, sum: 0 },
      create: { branchId: B2, linenItemId: l.id, floor: 'ALMACEN', rem: 40, sum: 0 },
    });
    for (const floor of ['1', '2']) {
      const rem = l.type === 'AMENITY' ? 5 : 8;
      await prisma.linenStock.upsert({
        where: { linenItemId_floor: { linenItemId: l.id, floor } }, update: { rem, sum: 0 },
        create: { branchId: B2, linenItemId: l.id, floor, rem, sum: 0 },
      });
    }
  }

  // 9. Permisos de recepción (igual que la otra sucursal, para el flujo demo)
  for (const key of ['reception.allowChangeRoom', 'reception.allowWriteOff', 'reception.allowViewCash']) {
    await prisma.setting.upsert({ where: { branchId_key: { branchId: B2, key } }, update: { value: 'true' }, create: { branchId: B2, key, value: 'true' } });
  }

  // 10. Turno de limpieza abierto para el usuario de limpieza en esta sucursal
  if (limp) {
    await prisma.cleaningShift.upsert({
      where: { id: 'b2-shift-limp' }, update: { status: 'OPEN', laundrySent: false, closedAt: null },
      create: { id: 'b2-shift-limp', branchId: B2, userId: limp.id, shiftType: 'MANANA', status: 'OPEN', laundrySent: false },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Sucursal 2 "RIZZOS Express" lista (datos DISTINTOS a RIZZOS).
   Tipos: Individual, Suite Ejecutiva · Habitaciones: A-101, A-102, B-201, B-202 (todas disponibles)
   Productos: snacks + cervezas (Pringles, Doritos, Maní, Pilsen, Cusqueña, Corona)
   Ropa: Azul Marino, Gris Perla, Negro Ejecutivo, Gel de baño
   Acceso para admin / recepcion${recep ? '' : ' (no encontrado)'} / limpieza. Cambia de sucursal en el selector.`);
}

main()
  .catch((e) => { /* eslint-disable-next-line no-console */ console.error('❌ Sucursal 2 falló:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
