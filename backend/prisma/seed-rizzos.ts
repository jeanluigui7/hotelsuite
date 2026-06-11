/**
 * Crea la sucursal RIZZOS ya configurada con sus catálogos base, habitaciones,
 * almacenes con productos/amenities y series de folios, y le da acceso al
 * Super Admin. Idempotente (IDs fijos → upsert).
 *   npx tsx prisma/seed-rizzos.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RZ = 'rz-branch-0001';

async function main(): Promise<void> {
  // 1. Sucursal
  const branch = await prisma.branch.upsert({
    where: { id: RZ },
    update: { name: 'RIZZOS' },
    create: {
      id: RZ,
      name: 'RIZZOS',
      address: 'Av. Los Olivos 456',
      taxId: '20987654321',
      legalName: 'RIZZOS Hoteles S.A.C.',
      phone: '014445566',
      currency: 'PEN',
      cutoffHour: 6,
    },
  });

  // 2. Acceso del Super Admin a RIZZOS
  const admin = await prisma.user.findUnique({ where: { email: 'admin@hotelsuite.local' } });
  if (admin) {
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: admin.id, branchId: RZ } },
      update: {},
      create: { userId: admin.id, branchId: RZ },
    });
  }

  // 3. Atributos de habitación
  const attrs = [
    { id: 'rz-attr-wifi', name: 'WiFi', icon: 'pi pi-wifi' },
    { id: 'rz-attr-tv', name: 'Smart TV', icon: 'pi pi-desktop' },
    { id: 'rz-attr-ac', name: 'Aire acondicionado', icon: 'pi pi-cloud' },
  ];
  for (const a of attrs) {
    await prisma.roomAttribute.upsert({ where: { id: a.id }, update: { name: a.name, icon: a.icon }, create: { id: a.id, branchId: RZ, ...a } });
  }

  // 4. Tipos de habitación + atributos
  const types = [
    { id: 'rz-rt-simple', name: 'Simple', capacity: 1, basePrice: 50, attrs: ['rz-attr-wifi', 'rz-attr-tv'] },
    { id: 'rz-rt-doble', name: 'Doble', capacity: 2, basePrice: 80, attrs: ['rz-attr-wifi', 'rz-attr-tv', 'rz-attr-ac'] },
  ];
  for (const t of types) {
    await prisma.roomType.upsert({
      where: { id: t.id },
      update: { name: t.name, capacity: t.capacity, basePrice: t.basePrice },
      create: { id: t.id, branchId: RZ, name: t.name, capacity: t.capacity, basePrice: t.basePrice, description: `Habitación ${t.name.toLowerCase()}` },
    });
    for (const attrId of t.attrs) {
      await prisma.roomTypeAttribute.upsert({
        where: { roomTypeId_attributeId: { roomTypeId: t.id, attributeId: attrId } },
        update: {},
        create: { roomTypeId: t.id, attributeId: attrId },
      });
    }
  }

  // 5. Tier de clientes
  await prisma.clientTier.upsert({
    where: { id: 'rz-tier-frec' },
    update: { name: 'Frecuente', discountPercent: 8 },
    create: { id: 'rz-tier-frec', branchId: RZ, name: 'Frecuente', discountPercent: 8, description: 'Cliente recurrente' },
  });

  // 6. Tarifas por tipo y duración
  const rates = [
    { id: 'rz-rate-s-3', roomTypeId: 'rz-rt-simple', label: '3 horas', durationMinutes: 180, price: 30 },
    { id: 'rz-rate-s-24', roomTypeId: 'rz-rt-simple', label: 'Noche (24h)', durationMinutes: 1440, price: 50 },
    { id: 'rz-rate-d-12', roomTypeId: 'rz-rt-doble', label: '12 horas', durationMinutes: 720, price: 65 },
    { id: 'rz-rate-d-24', roomTypeId: 'rz-rt-doble', label: 'Noche (24h)', durationMinutes: 1440, price: 80 },
  ];
  for (const r of rates) {
    await prisma.rate.upsert({
      where: { id: r.id },
      update: { label: r.label, price: r.price },
      create: { id: r.id, branchId: RZ, roomTypeId: r.roomTypeId, label: r.label, durationMinutes: r.durationMinutes, price: r.price },
    });
  }

  // 7. Áreas, categorías, items, horario
  await prisma.area.upsert({ where: { id: 'rz-area-rec' }, update: {}, create: { id: 'rz-area-rec', branchId: RZ, name: 'Recepción' } });
  await prisma.area.upsert({ where: { id: 'rz-area-pisos' }, update: {}, create: { id: 'rz-area-pisos', branchId: RZ, name: 'Pisos' } });
  await prisma.inventoryCategory.upsert({ where: { id: 'rz-cat-beb' }, update: {}, create: { id: 'rz-cat-beb', branchId: RZ, name: 'Bebidas' } });
  await prisma.inventoryCategory.upsert({ where: { id: 'rz-cat-amen' }, update: {}, create: { id: 'rz-cat-amen', branchId: RZ, name: 'Amenities' } });
  const items = [
    { id: 'rz-item-toalla', kind: 'CHECKIN', name: 'Toalla extra', price: 5 },
    { id: 'rz-item-hora', kind: 'RATE', name: 'Hora adicional', price: 12 },
    { id: 'rz-item-lav', kind: 'SERVICE', name: 'Lavandería', price: 20 },
  ];
  for (const it of items) {
    await prisma.item.upsert({ where: { id: it.id }, update: { name: it.name, price: it.price }, create: { id: it.id, branchId: RZ, kind: it.kind, name: it.name, price: it.price } });
  }
  await prisma.schedule.upsert({
    where: { id: 'rz-sch-1' },
    update: {},
    create: { id: 'rz-sch-1', branchId: RZ, name: 'Turno Mañana', startTime: '07:00', endTime: '15:00', daysOfWeek: '1,2,3,4,5,6,7' },
  });

  // 8. Habitaciones
  const rooms = [
    { id: 'rz-room-101', number: '101', floor: '1', roomTypeId: 'rz-rt-simple' },
    { id: 'rz-room-102', number: '102', floor: '1', roomTypeId: 'rz-rt-doble' },
    { id: 'rz-room-201', number: '201', floor: '2', roomTypeId: 'rz-rt-doble' },
    { id: 'rz-room-202', number: '202', floor: '2', roomTypeId: 'rz-rt-simple' },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: { number: r.number, floor: r.floor },
      create: { id: r.id, branchId: RZ, roomTypeId: r.roomTypeId, number: r.number, floor: r.floor },
    });
  }

  // 9. Almacenes + productos/amenities con stock
  await prisma.warehouse.upsert({ where: { id: 'rz-wh-prod' }, update: { name: 'Productos' }, create: { id: 'rz-wh-prod', branchId: RZ, name: 'Productos', type: 'PRODUCTS' } });
  await prisma.warehouse.upsert({ where: { id: 'rz-wh-amen' }, update: { name: 'Amenities' }, create: { id: 'rz-wh-amen', branchId: RZ, name: 'Amenities', type: 'AMENITIES' } });
  const products = [
    { id: 'rz-prd-agua', name: 'Agua mineral', salePrice: 3, cost: 1.2, qty: 60, wh: 'rz-wh-prod', reorder: 10 },
    { id: 'rz-prd-gas', name: 'Gaseosa', salePrice: 5, cost: 2.5, qty: 50, wh: 'rz-wh-prod', reorder: 10 },
    { id: 'rz-prd-cerv', name: 'Cerveza', salePrice: 8, cost: 4, qty: 36, wh: 'rz-wh-prod', reorder: 12 },
    { id: 'rz-prd-sham', name: 'Shampoo sachet', salePrice: 0, cost: 0.8, qty: 40, wh: 'rz-wh-amen', reorder: 15 },
    { id: 'rz-prd-jab', name: 'Jabón', salePrice: 0, cost: 0.5, qty: 45, wh: 'rz-wh-amen', reorder: 15 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { name: p.name, salePrice: p.salePrice, cost: p.cost, reorderPoint: p.reorder },
      create: { id: p.id, branchId: RZ, name: p.name, salePrice: p.salePrice, cost: p.cost, reorderPoint: p.reorder },
    });
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: p.id, warehouseId: p.wh } },
      update: { quantity: p.qty },
      create: { productId: p.id, warehouseId: p.wh, quantity: p.qty },
    });
  }

  // 10. Series de folios
  const folios = [
    { id: 'rz-fol-b', documentType: 'BOLETA', series: 'B001' },
    { id: 'rz-fol-f', documentType: 'FACTURA', series: 'F001' },
    { id: 'rz-fol-n', documentType: 'NOTE', series: 'NC01' },
  ];
  for (const f of folios) {
    await prisma.folioSeries.upsert({
      where: { id: f.id },
      update: {},
      create: { id: f.id, branchId: RZ, documentType: f.documentType, series: f.series },
    });
  }

  // 11. Checklist de inspección de limpieza
  for (const c of [
    { id: 'rz-chk-1', name: 'Cambio de sábanas' },
    { id: 'rz-chk-2', name: 'Limpieza de baño' },
  ]) {
    await prisma.checklistItem.upsert({ where: { id: c.id }, update: { name: c.name }, create: { id: c.id, branchId: RZ, name: c.name } });
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Sucursal RIZZOS lista (${branch.id}).
   Acceso: Super Admin asignado.
   Catálogos: ${attrs.length} atributos, ${types.length} tipos de habitación, 1 tier, ${rates.length} tarifas, 2 áreas, 2 categorías, ${items.length} items, 1 horario, 2 ítems de checklist
   Habitaciones: ${rooms.length}
   Almacenes: Productos (3) + Amenities (2) con stock
   Folios: ${folios.length} series (B001, F001, NC01)`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed RIZZOS falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
