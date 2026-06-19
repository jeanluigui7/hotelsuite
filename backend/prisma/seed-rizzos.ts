/**
 * Crea la sucursal RIZZOS ya configurada con sus catálogos base, habitaciones,
 * almacenes con productos/amenities y series de folios, y le da acceso al
 * Super Admin. Idempotente (IDs fijos → upsert).
 *   npx tsx prisma/seed-rizzos.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RZ = 'rz-branch-0001';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number): Date => new Date(Date.now() - ms);
const ahead = (ms: number): Date => new Date(Date.now() + ms);

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

  // ── 12. Datos operativos de arranque (para poder ejercer los procesos) ──
  const adminId = admin?.id;
  if (adminId) {
    // Huéspedes
    const guests = [
      { id: 'rz-guest-1', documentNumber: '70111222', firstName: 'Pedro', lastName: 'Salas', phone: '951111222' },
      { id: 'rz-guest-2', documentNumber: '70222333', firstName: 'Diana', lastName: 'Quispe', phone: '951222333' },
      { id: 'rz-guest-3', documentNumber: '70333444', firstName: 'Marco', lastName: 'Ríos', phone: '951333444' },
    ];
    for (const g of guests) {
      await prisma.guest.upsert({ where: { id: g.id }, update: { firstName: g.firstName, lastName: g.lastName, phone: g.phone }, create: { id: g.id, documentType: 'DNI', ...g } });
    }

    // Turno de caja ABIERTO (necesario para vender)
    const SESSION = 'rz-cash-1';
    await prisma.cashSession.upsert({
      where: { id: SESSION },
      update: { status: 'OPEN' },
      create: { id: SESSION, branchId: RZ, openedByUserId: adminId, status: 'OPEN', openingAmount: 100, openedAt: ago(4 * HOUR) },
    });
    await prisma.cashMovement.upsert({
      where: { id: 'rz-mov-in' }, update: {},
      create: { id: 'rz-mov-in', cashSessionId: SESSION, branchId: RZ, type: 'IN', amount: 50, concept: 'Fondo adicional', createdByUserId: adminId, createdAt: ago(3 * HOUR) },
    });

    // Estancias: 101 (en curso) y 201 (vencida); 102 historial cerrado
    await prisma.stay.upsert({
      where: { id: 'rz-stay-a' }, update: { status: 'OPEN' },
      create: { id: 'rz-stay-a', branchId: RZ, roomId: 'rz-room-101', guestId: 'rz-guest-1', rateId: 'rz-rate-s-24', status: 'OPEN', checkInAt: ago(2 * HOUR), plannedCheckoutAt: ahead(22 * HOUR), durationMinutes: 1440, priceAgreed: 50, adults: 1, children: 0 },
    });
    await prisma.stay.upsert({
      where: { id: 'rz-stay-b' }, update: { status: 'OPEN' },
      create: { id: 'rz-stay-b', branchId: RZ, roomId: 'rz-room-201', guestId: 'rz-guest-2', rateId: 'rz-rate-d-24', tierId: 'rz-tier-frec', status: 'OPEN', checkInAt: ago(26 * HOUR), plannedCheckoutAt: ago(2 * HOUR), durationMinutes: 1440, priceAgreed: 73.6, adults: 2, children: 0 },
    });
    await prisma.room.update({ where: { id: 'rz-room-101' }, data: { status: 'OCCUPIED' } });
    await prisma.room.update({ where: { id: 'rz-room-201' }, data: { status: 'OCCUPIED' } });

    // Reserva pendiente
    await prisma.reservation.upsert({
      where: { id: 'rz-res-1' }, update: {},
      create: { id: 'rz-res-1', branchId: RZ, roomTypeId: 'rz-rt-doble', guestName: 'Reserva web', phone: '999000111', expectedCheckInAt: ahead(1 * DAY), durationMinutes: 1440, adults: 2, status: 'PENDING' },
    });

    // Ventas: frigobar a la 101 (OPEN) y mostrador (PAID)
    await prisma.sale.upsert({
      where: { id: 'rz-sale-1' }, update: {},
      create: { id: 'rz-sale-1', branchId: RZ, stayId: 'rz-stay-a', cashSessionId: SESSION, total: 6, status: 'OPEN', createdByUserId: adminId, createdAt: ago(1 * HOUR), items: { create: [{ id: 'rz-sale-1-i1', productId: 'rz-prd-agua', description: 'Agua mineral', quantity: 2, unitPrice: 3, unitCost: 1.2, subtotal: 6 }] } },
    });
    await prisma.sale.upsert({
      where: { id: 'rz-sale-2' }, update: {},
      create: { id: 'rz-sale-2', branchId: RZ, customerName: 'Cliente mostrador', cashSessionId: SESSION, total: 5, status: 'PAID', createdByUserId: adminId, createdAt: ago(30 * 60_000), items: { create: [{ id: 'rz-sale-2-i1', productId: 'rz-prd-gas', description: 'Gaseosa', quantity: 1, unitPrice: 5, unitCost: 2.5, subtotal: 5 }] }, payments: { create: [{ id: 'rz-pay-1', branchId: RZ, cashSessionId: SESSION, method: 'CASH', amount: 5 }] } },
    });

    // Kardex de productos (ingreso + ventas) y stock final consistente (agua 60-2=58, gaseosa 50-1=49)
    const ims = [
      { id: 'rz-im-1', productId: 'rz-prd-agua', type: 'PURCHASE', quantity: 60, unitCost: 1.2, ref: 'Ingreso inicial', at: ago(5 * DAY) },
      { id: 'rz-im-2', productId: 'rz-prd-gas', type: 'PURCHASE', quantity: 50, unitCost: 2.5, ref: 'Ingreso inicial', at: ago(5 * DAY) },
      { id: 'rz-im-3', productId: 'rz-prd-agua', type: 'SALE', quantity: -2, unitCost: 1.2, ref: 'Venta rz-sale-1', at: ago(1 * HOUR) },
      { id: 'rz-im-4', productId: 'rz-prd-gas', type: 'SALE', quantity: -1, unitCost: 2.5, ref: 'Venta rz-sale-2', at: ago(30 * 60_000) },
    ];
    for (const m of ims) {
      await prisma.inventoryMovement.upsert({ where: { id: m.id }, update: {}, create: { id: m.id, branchId: RZ, productId: m.productId, warehouseId: 'rz-wh-prod', type: m.type, quantity: m.quantity, unitCost: m.unitCost, reference: m.ref, createdByUserId: adminId, createdAt: m.at } });
    }
    await prisma.stock.update({ where: { productId_warehouseId: { productId: 'rz-prd-agua', warehouseId: 'rz-wh-prod' } }, data: { quantity: 58 } });
    await prisma.stock.update({ where: { productId_warehouseId: { productId: 'rz-prd-gas', warehouseId: 'rz-wh-prod' } }, data: { quantity: 49 } });

    // Limpieza: una tarea pendiente y otra por inspeccionar
    await prisma.housekeepingTask.upsert({ where: { id: 'rz-task-1' }, update: {}, create: { id: 'rz-task-1', branchId: RZ, roomId: 'rz-room-102', assignedToUserId: adminId, status: 'DONE', result: 'PENDING', completedAt: ago(40 * 60_000), createdAt: ago(2 * HOUR) } });
    await prisma.housekeepingTask.upsert({ where: { id: 'rz-task-2' }, update: {}, create: { id: 'rz-task-2', branchId: RZ, roomId: 'rz-room-202', status: 'PENDING', result: 'PENDING', createdAt: ago(1 * HOUR) } });

    // Mantenimiento, observación, conserjería
    await prisma.maintenance.upsert({ where: { id: 'rz-mnt-1' }, update: {}, create: { id: 'rz-mnt-1', branchId: RZ, roomId: 'rz-room-202', title: 'Foco quemado', description: 'Cambiar foco del baño', status: 'OPEN', cost: 0, createdByUserId: adminId } });
    await prisma.observation.upsert({ where: { id: 'rz-obs-1' }, update: {}, create: { id: 'rz-obs-1', branchId: RZ, roomId: 'rz-room-101', title: 'Almohada extra', body: 'El huésped pidió una almohada adicional', status: 'OPEN', createdByUserId: adminId } });
    await prisma.conciergeRequest.upsert({ where: { id: 'rz-con-1' }, update: {}, create: { id: 'rz-con-1', branchId: RZ, roomId: 'rz-room-101', guestName: 'Pedro Salas', category: 'taxi', description: 'Taxi 7am al terminal', status: 'PENDING', createdByUserId: adminId } });
  }

  // ── 13. Ropa (linen) por pisos: toallas, sábanas, edredones ──
  const linen = [
    { id: 'rz-li-toa-blanca', type: 'TOALLA', name: 'Blanca', color: '#fff', reusable: true },
    { id: 'rz-li-toa-coral', type: 'TOALLA', name: 'Coral', color: '#ff7f6b', reusable: true },
    { id: 'rz-li-sab-blanca', type: 'SABANA', name: 'Blanca', color: '#fff', reusable: true },
    { id: 'rz-li-sab-azul', type: 'SABANA', name: 'Azul', color: '#3b82f6', reusable: true },
    { id: 'rz-li-edr-beige', type: 'EDREDON', name: 'Beige', color: '#d6c7a1', reusable: false },
  ];
  for (const l of linen) {
    await prisma.linenItem.upsert({ where: { id: l.id }, update: { name: l.name, color: l.color, reusable: l.reusable }, create: { id: l.id, branchId: RZ, type: l.type, name: l.name, color: l.color, reusable: l.reusable } });
    for (const floor of ['1', '2', '3']) {
      const sid = `${l.id}-p${floor}`;
      const rem = l.type === 'EDREDON' ? 4 : 12;
      await prisma.linenStock.upsert({ where: { linenItemId_floor: { linenItemId: l.id, floor } }, update: {}, create: { id: sid, branchId: RZ, linenItemId: l.id, floor, rem, sum: 0 } });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Sucursal RIZZOS lista (${branch.id}).
   Acceso: Super Admin asignado.
   Catálogos: ${attrs.length} atributos, ${types.length} tipos de habitación, 1 tier, ${rates.length} tarifas, 2 áreas, 2 categorías, ${items.length} items, 1 horario, 2 ítems de checklist
   Habitaciones: ${rooms.length}
   Almacenes: Productos (3) + Amenities (2) con stock
   Folios: ${folios.length} series (B001, F001, NC01)
   Operativo: 3 huespedes, turno de caja ABIERTO, 2 estancias activas (101 en curso, 201 vencida),
              1 reserva, 2 ventas (frigobar + mostrador), Kardex, 2 tareas de limpieza, mantenimiento/observacion/conserjeria`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed RIZZOS falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
