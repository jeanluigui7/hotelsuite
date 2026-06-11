/**
 * Demo data seed — populates operational data on top of the base seed so every
 * module/form has something to show and the main flows can be exercised.
 *
 * Idempotent: every record uses a stable id and is upserted. Stock is set to an
 * absolute value (not incremented) so re-running stays consistent. Run with:
 *   npx tsx prisma/demo-seed.ts   (requires the base seed to have run first)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BRANCH = '00000000-0000-0000-0000-000000000001';
const ROOM_TYPE = '00000000-0000-0000-0000-0000000000b1';
const TIER_VIP = '00000000-0000-0000-0000-0000000000c1';
const ROOM_101 = '00000000-0000-0000-0000-0000000bb101';
const ROOM_102 = '00000000-0000-0000-0000-0000000bb102';
const ROOM_201 = '00000000-0000-0000-0000-0000000bb201';
const WAREHOUSE = '00000000-0000-0000-0000-0000000wh001';
const PRD_AGUA = '00000000-0000-0000-0000-000000prd01';
const PRD_GASEOSA = '00000000-0000-0000-0000-000000prd02';

const HOUR = 3_600_000;
const DAY = 86_400_000;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}
function ahead(ms: number): Date {
  return new Date(Date.now() + ms);
}

async function main(): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@hotelsuite.local' } });
  if (!admin) throw new Error('Ejecuta primero el seed base (prisma db seed).');
  const adminId = admin.id;

  const rates = await prisma.rate.findMany({ where: { branchId: BRANCH, roomTypeId: ROOM_TYPE } });
  const rate = (min: number): string | null => rates.find((r) => r.durationMinutes === min)?.id ?? null;

  // ── Guests ──
  const guests = [
    { id: 'dm-guest-01', documentNumber: '40111222', firstName: 'María', lastName: 'Gonzales', phone: '987111222' },
    { id: 'dm-guest-02', documentNumber: '41222333', firstName: 'José', lastName: 'Ramírez', phone: '987222333' },
    { id: 'dm-guest-03', documentNumber: '42333444', firstName: 'Lucía', lastName: 'Torres', phone: '987333444' },
    { id: 'dm-guest-04', documentNumber: '43444555', firstName: 'Carlos', lastName: 'Mendoza', phone: '987444555' },
    { id: 'dm-guest-05', documentNumber: '44555666', firstName: 'Ana', lastName: 'Flores', phone: '987555666' },
  ];
  for (const g of guests) {
    await prisma.guest.upsert({
      where: { id: g.id },
      update: { firstName: g.firstName, lastName: g.lastName, phone: g.phone },
      create: { id: g.id, documentType: 'DNI', ...g },
    });
  }

  // ── Cash session (OPEN) ──
  const SESSION = 'dm-cash-01';
  await prisma.cashSession.upsert({
    where: { id: SESSION },
    update: { status: 'OPEN' },
    create: {
      id: SESSION,
      branchId: BRANCH,
      openedByUserId: adminId,
      status: 'OPEN',
      openingAmount: 100,
      openedAt: ago(5 * HOUR),
    },
  });
  await prisma.cashMovement.upsert({
    where: { id: 'dm-mov-in' },
    update: {},
    create: { id: 'dm-mov-in', cashSessionId: SESSION, branchId: BRANCH, type: 'IN', amount: 50, concept: 'Fondo adicional', createdByUserId: adminId, createdAt: ago(4 * HOUR) },
  });
  await prisma.cashMovement.upsert({
    where: { id: 'dm-mov-out' },
    update: {},
    create: { id: 'dm-mov-out', cashSessionId: SESSION, branchId: BRANCH, type: 'OUT', amount: 20, concept: 'Compra de útiles', createdByUserId: adminId, createdAt: ago(2 * HOUR) },
  });

  // ── Stays ──  101 ocupada (vencida), 201 ocupada (en curso), 102 cerrada (historial)
  await prisma.stay.upsert({
    where: { id: 'dm-stay-a' },
    update: { status: 'OPEN' },
    create: {
      id: 'dm-stay-a', branchId: BRANCH, roomId: ROOM_101, guestId: 'dm-guest-01',
      rateId: rate(1440), tierId: TIER_VIP, status: 'OPEN',
      checkInAt: ago(28 * HOUR), plannedCheckoutAt: ago(4 * HOUR), durationMinutes: 1440,
      priceAgreed: 54, adults: 2, children: 0,
    },
  });
  await prisma.stay.upsert({
    where: { id: 'dm-stay-b' },
    update: { status: 'OPEN' },
    create: {
      id: 'dm-stay-b', branchId: BRANCH, roomId: ROOM_201, guestId: 'dm-guest-02',
      rateId: rate(720), status: 'OPEN',
      checkInAt: ago(3 * HOUR), plannedCheckoutAt: ahead(9 * HOUR), durationMinutes: 720,
      priceAgreed: 50, adults: 1, children: 0,
    },
  });
  await prisma.stay.upsert({
    where: { id: 'dm-stay-c' },
    update: { status: 'CLOSED' },
    create: {
      id: 'dm-stay-c', branchId: BRANCH, roomId: ROOM_102, guestId: 'dm-guest-03',
      rateId: rate(180), status: 'CLOSED',
      checkInAt: ago(2 * DAY), plannedCheckoutAt: ago(2 * DAY - 3 * HOUR), checkOutAt: ago(2 * DAY - 3 * HOUR),
      durationMinutes: 180, priceAgreed: 35, adults: 2, children: 1,
    },
  });
  await prisma.room.update({ where: { id: ROOM_101 }, data: { status: 'OCCUPIED' } });
  await prisma.room.update({ where: { id: ROOM_201 }, data: { status: 'OCCUPIED' } });
  await prisma.room.update({ where: { id: ROOM_102 }, data: { status: 'CLEANING' } });

  // ── Reservations ──
  await prisma.reservation.upsert({
    where: { id: 'dm-res-01' },
    update: {},
    create: {
      id: 'dm-res-01', branchId: BRANCH, roomTypeId: ROOM_TYPE, guestId: 'dm-guest-04',
      expectedCheckInAt: ahead(1 * DAY), durationMinutes: 1440, adults: 2, status: 'CONFIRMED', phone: '987444555',
    },
  });
  await prisma.reservation.upsert({
    where: { id: 'dm-res-02' },
    update: {},
    create: {
      id: 'dm-res-02', branchId: BRANCH, roomTypeId: ROOM_TYPE, guestName: 'Reserva web', phone: '999888777',
      expectedCheckInAt: ahead(2 * DAY), durationMinutes: 720, adults: 2, status: 'PENDING',
    },
  });

  // ── Sales ──  sale1 = frigobar a la habitación 101 (OPEN), sale2 = venta directa (PAID)
  await prisma.sale.upsert({
    where: { id: 'dm-sale-1' },
    update: {},
    create: {
      id: 'dm-sale-1', branchId: BRANCH, stayId: 'dm-stay-a', cashSessionId: SESSION,
      total: 6, status: 'OPEN', createdByUserId: adminId, createdAt: ago(3 * HOUR),
      items: { create: [{ id: 'dm-sale-1-i1', productId: PRD_AGUA, description: 'Agua mineral', quantity: 2, unitPrice: 3, unitCost: 1.2, subtotal: 6 }] },
    },
  });
  await prisma.sale.upsert({
    where: { id: 'dm-sale-2' },
    update: {},
    create: {
      id: 'dm-sale-2', branchId: BRANCH, customerName: 'Cliente mostrador', cashSessionId: SESSION,
      total: 5, status: 'PAID', createdByUserId: adminId, createdAt: ago(1 * HOUR),
      items: { create: [{ id: 'dm-sale-2-i1', productId: PRD_GASEOSA, description: 'Gaseosa', quantity: 1, unitPrice: 5, unitCost: 2.5, subtotal: 5 }] },
      payments: { create: [{ id: 'dm-pay-1', branchId: BRANCH, cashSessionId: SESSION, method: 'CASH', amount: 5 }] },
    },
  });

  // ── Suppliers + Purchase invoice ──
  await prisma.supplier.upsert({
    where: { id: 'dm-sup-01' },
    update: {},
    create: { id: 'dm-sup-01', branchId: BRANCH, name: 'Distribuidora Andina', taxId: '20111222333', contact: 'Pedro', phone: '014567890' },
  });
  await prisma.supplier.upsert({
    where: { id: 'dm-sup-02' },
    update: {},
    create: { id: 'dm-sup-02', branchId: BRANCH, name: 'Amenities SAC', taxId: '20444555666', contact: 'Rosa', phone: '014561111' },
  });
  await prisma.purchaseInvoice.upsert({
    where: { id: 'dm-pur-01' },
    update: {},
    create: {
      id: 'dm-pur-01', branchId: BRANCH, supplierId: 'dm-sup-01', warehouseId: WAREHOUSE,
      documentNumber: 'F001-0001', total: 160, status: 'RECEIVED', createdByUserId: adminId, createdAt: ago(5 * DAY),
      items: {
        create: [
          { id: 'dm-pur-01-i1', productId: PRD_AGUA, quantity: 50, unitCost: 1.2, subtotal: 60 },
          { id: 'dm-pur-01-i2', productId: PRD_GASEOSA, quantity: 40, unitCost: 2.5, subtotal: 100 },
        ],
      },
    },
  });

  // ── Inventory movements (Kardex) ── ingreso por compra + salidas por venta; stock final consistente
  const movements = [
    { id: 'dm-im-1', productId: PRD_AGUA, type: 'PURCHASE', quantity: 50, unitCost: 1.2, reference: 'F001-0001', at: ago(5 * DAY) },
    { id: 'dm-im-2', productId: PRD_GASEOSA, type: 'PURCHASE', quantity: 40, unitCost: 2.5, reference: 'F001-0001', at: ago(5 * DAY) },
    { id: 'dm-im-3', productId: PRD_AGUA, type: 'SALE', quantity: -2, unitCost: 1.2, reference: 'Venta dm-sale-1', at: ago(3 * HOUR) },
    { id: 'dm-im-4', productId: PRD_GASEOSA, type: 'SALE', quantity: -1, unitCost: 2.5, reference: 'Venta dm-sale-2', at: ago(1 * HOUR) },
  ];
  for (const m of movements) {
    await prisma.inventoryMovement.upsert({
      where: { id: m.id },
      update: {},
      create: { id: m.id, branchId: BRANCH, productId: m.productId, warehouseId: WAREHOUSE, type: m.type, quantity: m.quantity, unitCost: m.unitCost, reference: m.reference, createdByUserId: adminId, createdAt: m.at },
    });
  }
  // Stock final = ingresos − ventas (agua 50-2=48, gaseosa 40-1=39)
  await prisma.stock.update({ where: { productId_warehouseId: { productId: PRD_AGUA, warehouseId: WAREHOUSE } }, data: { quantity: 48 } });
  await prisma.stock.update({ where: { productId_warehouseId: { productId: PRD_GASEOSA, warehouseId: WAREHOUSE } }, data: { quantity: 39 } });

  // ── Invoice (boleta) de la venta 2 ──
  await prisma.invoice.upsert({
    where: { id: 'dm-inv-01' },
    update: {},
    create: {
      id: 'dm-inv-01', branchId: BRANCH, saleId: 'dm-sale-2', type: 'BOLETA', series: 'B001', number: 1,
      customerName: 'Cliente mostrador', subtotal: 4.24, taxAmount: 0.76, total: 5, status: 'ISSUED',
      providerStatus: 'ACCEPTED', providerRef: 'MOCK-0001', createdByUserId: adminId, issuedAt: ago(1 * HOUR),
    },
  });

  // ── Checklist + housekeeping tasks + inspection ──
  const checklist = [
    { id: 'dm-chk-1', name: 'Cambio de sábanas' },
    { id: 'dm-chk-2', name: 'Limpieza de baño' },
    { id: 'dm-chk-3', name: 'Reposición de amenities' },
  ];
  for (const c of checklist) {
    await prisma.checklistItem.upsert({ where: { id: c.id }, update: { name: c.name }, create: { id: c.id, branchId: BRANCH, name: c.name } });
  }
  // task1: inspeccionada y aprobada (102)
  await prisma.housekeepingTask.upsert({
    where: { id: 'dm-task-1' },
    update: {},
    create: {
      id: 'dm-task-1', branchId: BRANCH, roomId: ROOM_102, assignedToUserId: adminId, status: 'INSPECTED', result: 'APPROVED',
      completedAt: ago(2 * HOUR), inspectedAt: ago(1 * HOUR), inspectedByUserId: adminId, createdAt: ago(3 * HOUR),
      inspections: {
        create: [
          { id: 'dm-insp-1', checklistItemId: 'dm-chk-1', passed: true },
          { id: 'dm-insp-2', checklistItemId: 'dm-chk-2', passed: true },
          { id: 'dm-insp-3', checklistItemId: 'dm-chk-3', passed: false, note: 'Faltó reponer shampoo' },
        ],
      },
    },
  });
  // task2: terminada, pendiente de inspección (201)
  await prisma.housekeepingTask.upsert({
    where: { id: 'dm-task-2' },
    update: {},
    create: { id: 'dm-task-2', branchId: BRANCH, roomId: ROOM_201, assignedToUserId: adminId, status: 'DONE', result: 'PENDING', completedAt: ago(30 * 60_000), createdAt: ago(2 * HOUR) },
  });
  // task3: pendiente (101)
  await prisma.housekeepingTask.upsert({
    where: { id: 'dm-task-3' },
    update: {},
    create: { id: 'dm-task-3', branchId: BRANCH, roomId: ROOM_101, status: 'PENDING', result: 'PENDING', createdAt: ago(1 * HOUR) },
  });

  // ── Maintenance + Revision ──
  await prisma.maintenance.upsert({
    where: { id: 'dm-mnt-1' },
    update: {},
    create: { id: 'dm-mnt-1', branchId: BRANCH, roomId: ROOM_201, title: 'Aire acondicionado no enfría', description: 'Revisar gas', status: 'OPEN', cost: 0, createdByUserId: adminId },
  });
  await prisma.revision.upsert({
    where: { id: 'dm-rev-1' },
    update: {},
    create: { id: 'dm-rev-1', branchId: BRANCH, roomId: ROOM_102, notes: 'Revisión post-limpieza', status: 'OK', createdByUserId: adminId },
  });

  // ── Laundry ──
  await prisma.laundryMachine.upsert({
    where: { id: 'dm-lm-1' },
    update: {},
    create: { id: 'dm-lm-1', branchId: BRANCH, name: 'Lavadora 1', capacity: '10kg', status: 'available' },
  });
  await prisma.laundryTask.upsert({
    where: { id: 'dm-lt-1' },
    update: {},
    create: { id: 'dm-lt-1', branchId: BRANCH, machineId: 'dm-lm-1', description: 'Sábanas habitación 102', status: 'DONE', createdByUserId: adminId, completedAt: ago(1 * HOUR) },
  });

  // ── Observations + Concierge ──
  await prisma.observation.upsert({
    where: { id: 'dm-obs-1' },
    update: {},
    create: { id: 'dm-obs-1', branchId: BRANCH, roomId: ROOM_201, title: 'Huésped solicita almohada extra', body: 'Llevar almohada adicional a la 201', status: 'OPEN', createdByUserId: adminId },
  });
  await prisma.conciergeRequest.upsert({
    where: { id: 'dm-con-1' },
    update: {},
    create: { id: 'dm-con-1', branchId: BRANCH, roomId: ROOM_101, guestName: 'María Gonzales', category: 'taxi', description: 'Taxi al aeropuerto 6am', status: 'PENDING', createdByUserId: adminId },
  });

  // ── Services (items kind SERVICE) ──
  const services = [
    { id: 'dm-svc-1', name: 'Lavandería express', price: 25 },
    { id: 'dm-svc-2', name: 'Late check-out', price: 30 },
  ];
  for (const s of services) {
    await prisma.item.upsert({ where: { id: s.id }, update: { name: s.name, price: s.price }, create: { id: s.id, branchId: BRANCH, kind: 'SERVICE', name: s.name, price: s.price } });
  }

  // ── WiFi pool ──
  await prisma.wifiCredential.upsert({
    where: { id: 'dm-wifi-1' },
    update: {},
    create: { id: 'dm-wifi-1', branchId: BRANCH, ssid: 'Hotel-Huespedes', password: 'bienvenido2026', note: 'Lobby y pisos 1-2' },
  });
  await prisma.wifiCredential.upsert({
    where: { id: 'dm-wifi-2' },
    update: {},
    create: { id: 'dm-wifi-2', branchId: BRANCH, ssid: 'Hotel-VIP', password: 'vip-suite-99', voucher: 'VIP-2026', note: 'Suites' },
  });

  // ── WhatsApp ──
  await prisma.whatsAppInstance.upsert({
    where: { id: 'dm-wa-1' },
    update: {},
    create: { id: 'dm-wa-1', branchId: BRANCH, name: 'Recepción', provider: 'mock', phoneNumber: '+51987000111', status: 'connected' },
  });
  await prisma.messageTemplate.upsert({
    where: { id: 'dm-tpl-1' },
    update: {},
    create: { id: 'dm-tpl-1', branchId: BRANCH, name: 'Bienvenida', body: 'Hola {{nombre}}, ¡bienvenido a {{hotel}}! Tu habitación es la {{habitacion}}.' },
  });
  await prisma.messageLog.upsert({
    where: { id: 'dm-msg-1' },
    update: {},
    create: { id: 'dm-msg-1', branchId: BRANCH, templateId: 'dm-tpl-1', to: '+51987111222', body: 'Hola María, ¡bienvenida a Sucursal Demo! Tu habitación es la 101.', status: 'SENT' },
  });
  await prisma.reminder.upsert({
    where: { id: 'dm-rem-1' },
    update: {},
    create: { id: 'dm-rem-1', branchId: BRANCH, name: 'Aviso de check-out', templateId: 'dm-tpl-1', trigger: '1h antes del checkout', active: true },
  });

  // eslint-disable-next-line no-console
  console.log(`✅ Datos demo insertados.
   Huéspedes: ${guests.length}
   Estancias: 2 activas (101 vencida, 201 en curso) + 1 historial (102)
   Reservas:  2 (1 confirmada, 1 pendiente)
   Caja:      turno abierto + 2 ventas (frigobar a 101, mostrador) + 2 movimientos
   Inventario: compra F001-0001 + Kardex (agua 48, gaseosa 39)
   Limpieza:  3 ítems checklist + 3 tareas (1 inspeccionada, 1 por inspeccionar, 1 pendiente)
   Otros:     2 proveedores, 1 boleta, mantenimiento, revisión, lavandería, observación, conserjería
   Catálogos: 2 servicios, 2 WiFi, WhatsApp (instancia+plantilla+mensaje+recordatorio)`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Demo seed falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
