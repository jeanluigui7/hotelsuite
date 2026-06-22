/**
 * Datos demo por PERFIL para la sucursal RIZZOS: crea un usuario de Recepción y
 * uno de Limpieza (para iniciar sesión y ver cada menú/flujo), agrega más
 * habitaciones en distintos estados y abre un turno de limpieza activo.
 *
 * Requiere haber corrido antes `prisma/seed.ts` (roles base) y `prisma/seed-rizzos.ts`.
 * Idempotente (IDs fijos → upsert).
 *   npx tsx prisma/demo-rizzos.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const RZ = 'rz-branch-0001';
const HOUR = 3_600_000;
const ago = (ms: number): Date => new Date(Date.now() - ms);
const ahead = (ms: number): Date => new Date(Date.now() + ms);

async function ensureRolePermission(roleId: string, module: string, action: string): Promise<void> {
  const perm = await prisma.permission.findUnique({ where: { module_action: { module, action } } });
  if (!perm) return;
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId: perm.id } },
    update: {},
    create: { roleId, permissionId: perm.id },
  });
}

async function main(): Promise<void> {
  // 1. Roles base (creados por seed.ts)
  const recepRole = await prisma.role.findFirst({ where: { name: 'Recepcionista' } });
  const limpRole = await prisma.role.findFirst({ where: { name: 'Supervisor de Limpieza' } });
  if (!recepRole || !limpRole) {
    throw new Error('Faltan roles base. Corre primero `npx prisma db seed`.');
  }

  // El recepcionista usa el Inventario de Recepción: ver + solicitar (create) +
  // recepcionar/enviar (edit) + dar de baja (delete).
  for (const action of ['view', 'create', 'edit', 'delete']) {
    await ensureRolePermission(recepRole.id, 'inventory', action);
  }

  // 2. Usuarios por perfil (contraseña Rizzos123!)
  const passwordHash = await bcrypt.hash('Rizzos123!', 10);
  const users = [
    { id: 'rz-user-recep', name: 'Lea Briceño Rojas', email: 'recepcion@rizzos.local', roleId: recepRole.id },
    { id: 'rz-user-limp', name: 'Carlos Mendoza', email: 'limpieza@rizzos.local', roleId: limpRole.id },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, roleId: u.roleId, status: 'active', passwordHash },
      create: { id: u.id, name: u.name, email: u.email, passwordHash, roleId: u.roleId },
    });
    const user = await prisma.user.findUnique({ where: { email: u.email } });
    if (user) {
      await prisma.userBranch.upsert({
        where: { userId_branchId: { userId: user.id, branchId: RZ } },
        update: {},
        create: { userId: user.id, branchId: RZ },
      });
    }
  }
  const limpUser = await prisma.user.findUnique({ where: { email: 'limpieza@rizzos.local' } });

  // 3. Más habitaciones en distintos estados (3 pisos)
  const rooms = [
    { id: 'rz-room-103', number: '103', floor: '1', roomTypeId: 'rz-rt-simple', status: 'CLEANING' },
    { id: 'rz-room-203', number: '203', floor: '2', roomTypeId: 'rz-rt-doble', status: 'FREE' },
    { id: 'rz-room-301', number: '301', floor: '3', roomTypeId: 'rz-rt-doble', status: 'OCCUPIED' },
    { id: 'rz-room-302', number: '302', floor: '3', roomTypeId: 'rz-rt-simple', status: 'CLEANING' },
    { id: 'rz-room-303', number: '303', floor: '3', roomTypeId: 'rz-rt-doble', status: 'FREE' },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: { number: r.number, floor: r.floor, status: r.status },
      create: { id: r.id, branchId: RZ, roomTypeId: r.roomTypeId, number: r.number, floor: r.floor, status: r.status },
    });
  }
  // Ajusta estados de las habitaciones base para mostrar el set de diseños RIZZOS:
  // 101 = Limpieza en espera (naranja), 102 = Inspeccionando (gris), 202 = Mantenimiento.
  await prisma.room.update({ where: { id: 'rz-room-101' }, data: { status: 'CLEANING' } });
  await prisma.room.update({ where: { id: 'rz-room-102' }, data: { status: 'INSPECCIONANDO' } });
  await prisma.room.update({ where: { id: 'rz-room-202' }, data: { status: 'MAINTENANCE' } });

  // 4. Estancia activa en la 301 (nuevo huésped)
  await prisma.guest.upsert({
    where: { id: 'rz-guest-4' },
    update: { firstName: 'Lucía', lastName: 'Fernández', phone: '951444555' },
    create: { id: 'rz-guest-4', documentType: 'DNI', documentNumber: '70444555', firstName: 'Lucía', lastName: 'Fernández', phone: '951444555' },
  });
  await prisma.stay.upsert({
    where: { id: 'rz-stay-c' },
    update: { status: 'OPEN' },
    create: {
      id: 'rz-stay-c', branchId: RZ, roomId: 'rz-room-301', guestId: 'rz-guest-4', rateId: 'rz-rate-d-12',
      status: 'OPEN', checkInAt: ago(3 * HOUR), plannedCheckoutAt: ahead(9 * HOUR), durationMinutes: 720,
      priceAgreed: 65, adults: 2, children: 0, vehiclePlate: 'ABC-123',
    },
  });

  // 5. Turno de limpieza ACTIVO para el usuario de limpieza (Gestión de Turno)
  if (limpUser) {
    // Cierra turnos previos del usuario (de sesiones anteriores) para que solo quede uno abierto.
    await prisma.cleaningShift.updateMany({ where: { branchId: RZ, userId: limpUser.id, status: 'OPEN', id: { not: 'rz-shift-limp' } }, data: { status: 'CLOSED', closedAt: ago(3 * HOUR) } });
    await prisma.cleaningShift.upsert({
      where: { id: 'rz-shift-limp' },
      update: { status: 'OPEN', laundrySent: false, openedAt: ago(2 * HOUR), closedAt: null },
      create: { id: 'rz-shift-limp', branchId: RZ, userId: limpUser.id, shiftType: 'MANANA', status: 'OPEN', laundrySent: false, openedAt: ago(2 * HOUR) },
    });

    // Tareas de limpieza variadas (en curso + realizadas) para el dashboard
    await prisma.housekeepingTask.upsert({
      where: { id: 'rz-task-3' }, update: { status: 'IN_PROGRESS' },
      create: { id: 'rz-task-3', branchId: RZ, roomId: 'rz-room-302', assignedToUserId: limpUser.id, status: 'IN_PROGRESS', result: 'PENDING', createdAt: ago(40 * 60_000) },
    });
    await prisma.housekeepingTask.upsert({
      where: { id: 'rz-task-4' }, update: { status: 'DONE' },
      create: { id: 'rz-task-4', branchId: RZ, roomId: 'rz-room-203', assignedToUserId: limpUser.id, status: 'DONE', result: 'APPROVED', completedAt: ago(20 * 60_000), createdAt: ago(90 * 60_000) },
    });

    // --- Historial de Limpieza: estancias cerradas (para el Tipo) + tareas finalizadas con ropa ---
    const recep = await prisma.user.findUnique({ where: { email: 'recepcion@rizzos.local' } });
    const guest = await prisma.guest.findFirst({ where: {} });
    if (guest) {
      // CHECK OUT (corta) en 203 y PERNOCTA (>=600 min) en 103, ya cerradas.
      await prisma.stay.upsert({
        where: { id: 'rz-stay-hist-co' }, update: {},
        create: { id: 'rz-stay-hist-co', branchId: RZ, roomId: 'rz-room-203', guestId: guest.id, status: 'CLOSED', checkInAt: ago(6 * HOUR), plannedCheckoutAt: ago(3 * HOUR), checkOutAt: ago(95 * 60_000), durationMinutes: 180, priceAgreed: 80 },
      });
      await prisma.stay.upsert({
        where: { id: 'rz-stay-hist-pe' }, update: {},
        create: { id: 'rz-stay-hist-pe', branchId: RZ, roomId: 'rz-room-103', guestId: guest.id, status: 'CLOSED', checkInAt: ago(13 * HOUR), plannedCheckoutAt: ago(1 * HOUR), checkOutAt: ago(70 * 60_000), durationMinutes: 720, priceAgreed: 120 },
      });
    }
    // Tareas finalizadas con inspección de ropa (recogidos = pickup true, dejados = pickup false).
    const histTasks: { id: string; roomId: string; created: number; completed: number; user: string; linen: { d: string; pickup: boolean }[] }[] = [
      { id: 'rz-htask-203', roomId: 'rz-room-203', created: 100 * 60_000, completed: 92 * 60_000, user: limpUser.id, linen: [{ d: 'Toalla de cuerpo', pickup: true }, { d: 'Sábana matrimonial', pickup: true }, { d: 'Funda de almohada', pickup: false }] },
      { id: 'rz-htask-103', roomId: 'rz-room-103', created: 9 * HOUR, completed: 65 * 60_000, user: limpUser.id, linen: [] },
      { id: 'rz-htask-201', roomId: 'rz-room-201', created: 150 * 60_000, completed: 143 * 60_000, user: recep?.id ?? limpUser.id, linen: [{ d: 'Toalla de mano', pickup: true }, { d: 'Sábana matrimonial', pickup: true }, { d: 'Cubrecama', pickup: false }, { d: 'Funda de almohada', pickup: false }] },
    ];
    for (const t of histTasks) {
      await prisma.linenInspection.deleteMany({ where: { taskId: t.id } });
      await prisma.housekeepingTask.upsert({
        where: { id: t.id },
        update: { status: 'DONE', result: 'APPROVED', completedAt: ago(t.completed) },
        create: {
          id: t.id, branchId: RZ, roomId: t.roomId, assignedToUserId: t.user, status: 'DONE', result: 'APPROVED',
          createdAt: ago(t.created), completedAt: ago(t.completed),
          linenInspections: { create: t.linen.map((l) => ({ description: l.d, state: 'OK', pickup: l.pickup })) },
        },
      });
    }
    // Suministro de cortesía entregado (fila SUMINISTRO con badge CORTESÍA).
    for (const s of [
      { id: 'rz-sup-202a', roomId: 'rz-room-202', description: 'Incaica Roja', quantity: 1 },
      { id: 'rz-sup-202b', roomId: 'rz-room-202', description: 'Verde Margarita', quantity: 1 },
    ]) {
      await prisma.roomSupply.upsert({
        where: { id: s.id }, update: { status: 'DELIVERED', deliveredAt: ago(110 * 60_000) },
        create: { id: s.id, branchId: RZ, roomId: s.roomId, description: s.description, quantity: s.quantity, status: 'DELIVERED', createdByUserId: recep?.id ?? limpUser.id, createdAt: ago(120 * 60_000), deliveredAt: ago(110 * 60_000) },
      });
    }
  }

  // 6. Revisiones de mantenimiento (para poblar la tabla "Revisiones de Mantenimiento")
  const admin = await prisma.user.findUnique({ where: { email: 'admin@hotelsuite.local' } });
  const colab = (i: number): string | undefined => (i % 2 === 0 ? limpUser?.id : admin?.id) ?? undefined;
  const revs = [
    { id: 'rz-rev-1', roomId: 'rz-room-102', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: 'Todo conforme', at: ago(1 * HOUR) },
    { id: 'rz-rev-2', roomId: 'rz-room-103', status: 'ISSUE', tipoFalla: 'Pintura/Paredes', acciones: ['Limpieza de paredes'], obs: 'Pared con manchas', at: ago(5 * HOUR) },
    { id: 'rz-rev-3', roomId: 'rz-room-203', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: null, at: ago(20 * HOUR) },
    { id: 'rz-rev-4', roomId: 'rz-room-303', status: 'ISSUE', tipoFalla: 'Electricidad', acciones: ['Cambio de foco'], obs: 'Foco del baño quemado', at: ago(28 * HOUR) },
    // Historial completo de la Habitación 101 (1 preventivo con falla crítica + 3 periódicos).
    { id: 'rz-rev-101a', roomId: 'rz-room-101', status: 'ISSUE', tipoFalla: 'ELECTRICIDAD/ILUMINACIÓN: Foco quemado en la habitación', acciones: [], obs: 'Se requiere cambiar el foco principal.', hasPhoto: true, at: ago(106 * HOUR) },
    { id: 'rz-rev-101b', roomId: 'rz-room-101', status: 'OK', tipoFalla: null, acciones: ['Limpieza de paredes'], obs: null, at: ago(5 * HOUR) },
    { id: 'rz-rev-101c', roomId: 'rz-room-101', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: null, at: ago(7 * HOUR) },
    { id: 'rz-rev-101d', roomId: 'rz-room-101', status: 'OK', tipoFalla: null, acciones: ['Cambio de cortinas'], obs: 'Cortinas repuestas.', at: ago(28 * HOUR) },
  ];
  // Foto demo (SVG embebido como data URL) para que el historial muestre una imagen real.
  const demoFotoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="#1f2937"/><rect x="20" y="20" width="280" height="180" rx="10" fill="#111827" stroke="#374151"/><circle cx="110" cy="95" r="34" fill="#fbbf24"/><rect x="95" y="130" width="130" height="14" rx="7" fill="#374151"/><rect x="95" y="155" width="90" height="12" rx="6" fill="#374151"/><text x="160" y="205" fill="#9ca3af" font-family="sans-serif" font-size="12" text-anchor="middle">Foto: foco quemado - Hab. 101</text></svg>`;
  const demoFoto = `data:image/svg+xml;base64,${Buffer.from(demoFotoSvg).toString('base64')}`;
  for (let i = 0; i < revs.length; i++) {
    const r = revs[i] as (typeof revs)[number] & { hasPhoto?: boolean };
    await prisma.revision.upsert({
      where: { id: r.id },
      update: { photo: r.hasPhoto ? demoFoto : null },
      create: {
        id: r.id, branchId: RZ, roomId: r.roomId, status: r.status,
        notes: JSON.stringify({ tipoFalla: r.tipoFalla, acciones: r.acciones, observaciones: r.obs, hasPhoto: !!r.hasPhoto }),
        photo: r.hasPhoto ? demoFoto : null,
        createdByUserId: colab(i), createdAt: r.at,
      },
    });
  }

  // 7. Movimientos de ropa (para poblar "Movimientos de Inventario (Limpieza)")
  const lmv = [
    { id: 'rz-lmv-1', linenItemId: 'rz-li-toa-coral', type: 'TRANSFER', quantity: 6, floor: '1', roomId: null, from: 'Almacén de Ropa', to: 'Limpieza P1', ref: 'Suministro admin', at: ago(2 * HOUR) },
    { id: 'rz-lmv-2', linenItemId: 'rz-li-toa-blanca', type: 'SUPPLY', quantity: -1, floor: '3', roomId: 'rz-room-301', from: 'Limpieza P3', to: 'Habitaciones', ref: 'Suministro a habitación', at: ago(90 * 60_000) },
    { id: 'rz-lmv-3', linenItemId: 'rz-li-sab-blanca', type: 'LAUNDRY', quantity: -1, floor: '2', roomId: null, from: 'Limpieza', to: 'Lavandería', ref: 'Manchada', at: ago(70 * 60_000) },
    { id: 'rz-lmv-4', linenItemId: 'rz-li-edr-beige', type: 'TRANSFER', quantity: 4, floor: '2', roomId: null, from: 'Almacén de Ropa', to: 'Limpieza P2', ref: 'Suministro admin', at: ago(40 * 60_000) },
    { id: 'rz-lmv-5', linenItemId: 'rz-li-toa-coral', type: 'LAUNDRY', quantity: -2, floor: '1', roomId: null, from: 'Limpieza', to: 'Lavandería', ref: 'Deteriorada', at: ago(15 * 60_000) },
  ];
  for (const m of lmv) {
    await prisma.linenMovement.upsert({
      where: { id: m.id },
      update: {},
      create: { id: m.id, branchId: RZ, linenItemId: m.linenItemId, type: m.type, quantity: m.quantity, floor: m.floor, roomId: m.roomId, areaFrom: m.from, areaTo: m.to, reference: m.ref, createdByUserId: limpUser?.id, createdAt: m.at },
    });
  }

  // 8. Catálogo de productos del almacén (para el flujo de Almacén de Productos / ventas)
  const cats = [
    { id: 'rz-cat-aguas', name: 'Aguas y Refrescos' },
    { id: 'rz-cat-energ', name: 'Energizantes y rehidratantes' },
    { id: 'rz-cat-gall', name: 'Galletas' },
    { id: 'rz-cat-choc', name: 'Chocolates y Dulces' },
  ];
  for (const c of cats) {
    await prisma.inventoryCategory.upsert({ where: { id: c.id }, update: { name: c.name }, create: { id: c.id, branchId: RZ, name: c.name } });
  }
  const prods = [
    { id: 'rz-p-sanluis-sg', sku: 'PROD-001', name: 'San Luis SIN GAS', cat: 'rz-cat-aguas', venta: 3, compra: 1.24, stock: 15, reorder: 12 },
    { id: 'rz-p-sanluis-cg', sku: 'PROD-002', name: 'San Luis CON GAS', cat: 'rz-cat-aguas', venta: 3, compra: 1.2, stock: 14, reorder: 5 },
    { id: 'rz-p-coca', sku: 'PROD-004', name: 'Coca Cola', cat: 'rz-cat-aguas', venta: 4, compra: 2.62, stock: 12, reorder: 6 },
    { id: 'rz-p-inka', sku: 'PROD-005', name: 'Inka Cola', cat: 'rz-cat-aguas', venta: 4, compra: 2.5, stock: 9, reorder: 5 },
    { id: 'rz-p-fanta', sku: 'PROD-006', name: 'Fanta', cat: 'rz-cat-aguas', venta: 3, compra: 1.8, stock: 8, reorder: 5 },
    { id: 'rz-p-frugos', sku: 'PROD-009', name: 'Frugos del Valle 1 L', cat: 'rz-cat-aguas', venta: 6, compra: 3.5, stock: 10, reorder: 4 },
    { id: 'rz-p-sporade', sku: 'PROD-011', name: 'Sporade', cat: 'rz-cat-energ', venta: 3.5, compra: 2.37, stock: 12, reorder: 8 },
    { id: 'rz-p-gatorade', sku: 'PROD-012', name: 'Gatorade', cat: 'rz-cat-energ', venta: 3.5, compra: 2.4, stock: 14, reorder: 6 },
    { id: 'rz-p-volt', sku: 'PROD-013', name: 'Volt', cat: 'rz-cat-energ', venta: 3.5, compra: 2.3, stock: 27, reorder: 10 },
    { id: 'rz-p-morochas', sku: 'PROD-020', name: 'Morochas', cat: 'rz-cat-gall', venta: 1.5, compra: 0.8, stock: 30, reorder: 10 },
    { id: 'rz-p-oreo', sku: 'PROD-021', name: 'Oreo', cat: 'rz-cat-gall', venta: 1.5, compra: 0.9, stock: 25, reorder: 10 },
    { id: 'rz-p-bonbon', sku: 'PROD-030', name: 'Chupetin Bon Bon Bum', cat: 'rz-cat-choc', venta: 1, compra: 0.5, stock: 40, reorder: 15 },
    { id: 'rz-p-triangulo', sku: 'PROD-031', name: 'Triangulo', cat: 'rz-cat-choc', venta: 3, compra: 1.8, stock: 18, reorder: 6 },
    { id: 'rz-p-jabon', sku: 'AMN-005', name: 'Jabón granel + papel fraccionado', cat: 'rz-cat-amen', venta: 0.5, compra: 0.3, stock: 12, reorder: 10 },
  ];
  for (const p of prods) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { name: p.name, sku: p.sku, salePrice: p.venta, cost: p.compra, reorderPoint: p.reorder, categoryId: p.cat },
      create: { id: p.id, branchId: RZ, name: p.name, sku: p.sku, salePrice: p.venta, cost: p.compra, reorderPoint: p.reorder, categoryId: p.cat },
    });
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: p.id, warehouseId: 'rz-wh-prod' } },
      update: { quantity: p.stock },
      create: { productId: p.id, warehouseId: 'rz-wh-prod', quantity: p.stock },
    });
  }

  // 9. Stock en el almacén de RECEPCIÓN (inventario de recepción por turno)
  let recWh = await prisma.warehouse.findFirst({ where: { branchId: RZ, type: 'RECEPTION' } });
  if (!recWh) recWh = await prisma.warehouse.create({ data: { id: 'rz-wh-rec', branchId: RZ, name: 'Recepción', type: 'RECEPTION' } });
  const recStock: Record<string, number> = {
    'rz-p-sanluis-sg': 9, 'rz-p-sanluis-cg': 19, 'rz-p-coca': 20, 'rz-p-inka': 20, 'rz-p-fanta': 9,
    'rz-p-frugos': 2, 'rz-p-sporade': 8, 'rz-p-gatorade': 14, 'rz-p-volt': 27, 'rz-p-morochas': 30,
    'rz-p-oreo': 25, 'rz-p-bonbon': 40, 'rz-p-triangulo': 18, 'rz-p-jabon': 12,
  };
  for (const [pid, q] of Object.entries(recStock)) {
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: pid, warehouseId: recWh.id } },
      update: { quantity: q },
      create: { productId: pid, warehouseId: recWh.id, quantity: q },
    });
  }

  // 10. Permisos de recepción habilitados por el admin (para el flujo demo)
  for (const key of ['reception.allowChangeRoom', 'reception.allowWriteOff', 'reception.allowViewCash']) {
    await prisma.setting.upsert({
      where: { branchId_key: { branchId: RZ, key } },
      update: { value: 'true' },
      create: { branchId: RZ, key, value: 'true' },
    });
  }

  // 11. Más colores de ropa + amenities (linen) para el flujo de recojo/reposición
  const moreLinen = [
    { id: 'rz-li-toa-verde', type: 'TOALLA', name: 'Verde Margarita', color: '#22c55e', reusable: true },
    { id: 'rz-li-sab-incaica', type: 'SABANA', name: 'Incaica Roja', color: '#ef4444', reusable: true },
    { id: 'rz-li-sab-azulbol', type: 'SABANA', name: 'Azul Bolas', color: '#3b82f6', reusable: true },
    { id: 'rz-li-amn-jabon', type: 'AMENITY', name: 'Jabón granel + papel fraccionado', color: '#fcd34d', reusable: false },
    { id: 'rz-li-amn-shampoo', type: 'AMENITY', name: 'Shampoo sachet', color: '#a78bfa', reusable: false },
  ];
  for (const l of moreLinen) {
    await prisma.linenItem.upsert({ where: { id: l.id }, update: { name: l.name, color: l.color, reusable: l.reusable }, create: { id: l.id, branchId: RZ, type: l.type, name: l.name, color: l.color, reusable: l.reusable } });
    for (const floor of ['1', '2', '3']) {
      await prisma.linenStock.upsert({ where: { linenItemId_floor: { linenItemId: l.id, floor } }, update: {}, create: { id: `${l.id}-p${floor}`, branchId: RZ, linenItemId: l.id, floor, rem: l.type === 'AMENITY' ? 6 : 10, sum: 0 } });
    }
  }

  // 12. Inspección de la limpieza en curso (rz-task-3, hab 302) para ver la reposición al finalizar
  await prisma.linenInspection.deleteMany({ where: { taskId: 'rz-task-3' } });
  const insp = [
    { id: 'rz-li-toa-verde', desc: 'Toalla Verde Margarita', state: 'OK', pickup: true },
    { id: 'rz-li-sab-incaica', desc: 'Sábana Incaica Roja', state: 'OK', pickup: false },
    { id: 'rz-li-sab-azulbol', desc: 'Sábana Azul Bolas', state: 'OK', pickup: true },
    { id: 'rz-li-amn-jabon', desc: 'Jabón granel + papel fraccionado', state: 'OK', pickup: true },
  ];
  for (const it of insp) {
    await prisma.linenInspection.create({ data: { taskId: 'rz-task-3', linenItemId: it.id, description: it.desc, state: it.state, pickup: it.pickup } });
  }

  // 13. Habitación EN REVISIÓN PERIÓDICA (tarjeta morada con cronómetro)
  await prisma.revision.upsert({
    where: { id: 'rz-rev-pend-303' },
    update: { status: 'PENDING', createdAt: ago(106 * HOUR) },
    create: { id: 'rz-rev-pend-303', branchId: RZ, roomId: 'rz-room-303', status: 'PENDING', createdByUserId: limpUser?.id, createdAt: ago(106 * HOUR) },
  });
  await prisma.room.update({ where: { id: 'rz-room-303' }, data: { status: 'REVISION' } });

  // eslint-disable-next-line no-console
  console.log(`✅ Demo RIZZOS por perfil lista.
   Usuarios (contraseña Rizzos123!):
     • recepcion@rizzos.local  → Recepcionista (Lea Briceño Rojas)
     • limpieza@rizzos.local   → Supervisor de Limpieza (Carlos Mendoza)
   Habitaciones: +5 (total 9) en estados FREE/OCCUPIED/CLEANING/MAINTENANCE en 3 pisos
   Estancia nueva: 301 (Lucía Fernández, placa ABC-123)
   Turno de limpieza ABIERTO para limpieza@rizzos.local + 2 tareas (1 en curso, 1 hecha)`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Demo RIZZOS falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
