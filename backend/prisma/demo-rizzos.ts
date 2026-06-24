/**
 * Datos demo LIMPIOS para la sucursal RIZZOS, listos para una demostración real.
 *
 * Deja SOLO lo necesario:
 *   - Usuarios por perfil (admin/recepción/limpieza).
 *   - Catálogos: tipos de habitación, tarifas (incluida pernoctación), tiers, productos.
 *   - Stock real y sincronizado: almacén central de productos, almacén de recepción,
 *     almacén central de ropa (ALMACEN) y remanente por piso.
 *   - Habitaciones TODAS disponibles (para registrar un check-in real).
 *   - Historial real de mantenimientos (revisiones).
 *   - Un turno de limpieza abierto.
 *
 * Borra todo el clutter transaccional (estancias, ventas, tareas de limpieza,
 * suministros, movimientos de ropa, solicitudes) para partir de un estado limpio.
 *
 * Requiere `prisma/seed.ts` (roles) y `prisma/seed-rizzos.ts` (branch/catálogos base).
 * Idempotente.  npx tsx prisma/demo-rizzos.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const RZ = 'rz-branch-0001';
const HOUR = 3_600_000;
const ago = (ms: number): Date => new Date(Date.now() - ms);

async function ensureRolePermission(roleId: string, module: string, action: string): Promise<void> {
  const perm = await prisma.permission.findUnique({ where: { module_action: { module, action } } });
  if (!perm) return;
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId: perm.id } },
    update: {},
    create: { roleId, permissionId: perm.id },
  });
}

/** Borra los datos transaccionales de la sucursal para partir de un estado limpio (orden FK-seguro). */
async function cleanTransactional(): Promise<void> {
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.payment.deleteMany({ where: { sale: { branchId: RZ } } }),
    () => prisma.saleItem.deleteMany({ where: { sale: { branchId: RZ } } }),
    () => prisma.sale.deleteMany({ where: { branchId: RZ } }),
    () => prisma.cashMovement.deleteMany({ where: { session: { branchId: RZ } } }),
    () => prisma.cashSession.deleteMany({ where: { branchId: RZ } }),
    () => prisma.linenInspection.deleteMany({ where: { task: { branchId: RZ } } }),
    () => prisma.taskInspection.deleteMany({ where: { task: { branchId: RZ } } }),
    () => prisma.housekeepingTask.deleteMany({ where: { branchId: RZ } }),
    () => prisma.roomSupply.deleteMany({ where: { branchId: RZ } }),
    () => prisma.linenMovement.deleteMany({ where: { branchId: RZ } }),
    () => prisma.revision.deleteMany({ where: { branchId: RZ } }),
    () => prisma.maintenance.deleteMany({ where: { branchId: RZ } }),
    () => prisma.observation.deleteMany({ where: { branchId: RZ } }),
    () => prisma.conciergeRequest.deleteMany({ where: { branchId: RZ } }),
    () => prisma.reservation.deleteMany({ where: { branchId: RZ } }),
    () => prisma.stayGuest.deleteMany({ where: { stay: { branchId: RZ } } }),
    () => prisma.stay.deleteMany({ where: { branchId: RZ } }),
    () => prisma.productRequestItem.deleteMany({ where: { request: { branchId: RZ } } }),
    () => prisma.productRequest.deleteMany({ where: { branchId: RZ } }),
  ];
  for (const step of steps) {
    try { await step(); } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('  · limpieza: paso omitido', (e as Error).message?.slice(0, 80));
    }
  }
}

async function main(): Promise<void> {
  // 1. Roles base (creados por seed.ts)
  const recepRole = await prisma.role.findFirst({ where: { name: 'Recepcionista' } });
  const limpRole = await prisma.role.findFirst({ where: { name: 'Supervisor de Limpieza' } });
  const gerenteRole = await prisma.role.findFirst({ where: { name: 'Gerente' } });
  if (!recepRole || !limpRole) throw new Error('Faltan roles base. Corre primero `npx prisma db seed`.');

  // Recepción: inventario (ver/solicitar/recepcionar/baja).
  for (const action of ['view', 'create', 'edit', 'delete']) await ensureRolePermission(recepRole.id, 'inventory', action);
  // Gerente: gestión completa de configuración (tarifas, tipos de habitación, etc.).
  if (gerenteRole) for (const action of ['view', 'create', 'edit', 'delete']) await ensureRolePermission(gerenteRole.id, 'settings', action);

  // 2. Usuarios por perfil (contraseña Rizzos123!)
  const passwordHash = await bcrypt.hash('Rizzos123!', 10);
  const users = [
    { id: 'rz-user-recep', name: 'Lea Briceño Rojas', email: 'recepcion@rizzos.local', roleId: recepRole.id },
    { id: 'rz-user-limp', name: 'Carlos Mendoza', email: 'limpieza@rizzos.local', roleId: limpRole.id },
    ...(gerenteRole ? [{ id: 'rz-user-gerente', name: 'Rubén Gerente', email: 'gerente@rizzos.local', roleId: gerenteRole.id }] : []),
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
        update: {}, create: { userId: user.id, branchId: RZ },
      });
    }
  }
  const limpUser = await prisma.user.findUnique({ where: { email: 'limpieza@rizzos.local' } });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@hotelsuite.local' } });

  // --- LIMPIEZA de datos transaccionales (estado limpio para la demo) ---
  await cleanTransactional();

  // 3. Habitaciones (3 pisos) TODAS disponibles para registrar un check-in real
  const rooms = [
    { id: 'rz-room-103', number: '103', floor: '1', roomTypeId: 'rz-rt-simple' },
    { id: 'rz-room-203', number: '203', floor: '2', roomTypeId: 'rz-rt-doble' },
    { id: 'rz-room-301', number: '301', floor: '3', roomTypeId: 'rz-rt-doble' },
    { id: 'rz-room-302', number: '302', floor: '3', roomTypeId: 'rz-rt-simple' },
    { id: 'rz-room-303', number: '303', floor: '3', roomTypeId: 'rz-rt-doble' },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: { number: r.number, floor: r.floor, status: 'FREE' },
      create: { id: r.id, branchId: RZ, roomTypeId: r.roomTypeId, number: r.number, floor: r.floor, status: 'FREE' },
    });
  }
  // Todas las habitaciones de la sucursal quedan disponibles.
  await prisma.room.updateMany({ where: { branchId: RZ }, data: { status: 'FREE' } });

  // 3b. Tarifas por tipo de habitación (Duración / Tarifa del check-in). Incluye Pernoctación.
  const rates = [
    { roomTypeId: 'rz-rt-simple', label: '3 horas', durationMinutes: 180, price: 30, pernocta: false },
    { roomTypeId: 'rz-rt-simple', label: '12 horas', durationMinutes: 720, price: 45, pernocta: false },
    { roomTypeId: 'rz-rt-simple', label: 'DIA HOTELERO', durationMinutes: 1440, price: 50, pernocta: true },
    { roomTypeId: 'rz-rt-doble', label: '3 horas', durationMinutes: 180, price: 40, pernocta: false },
    { roomTypeId: 'rz-rt-doble', label: '12 horas', durationMinutes: 720, price: 60, pernocta: false },
    { roomTypeId: 'rz-rt-doble', label: 'DIA HOTELERO', durationMinutes: 1440, price: 80, pernocta: true },
  ];
  for (const t of rates) {
    await prisma.rate.upsert({
      where: { branchId_roomTypeId_durationMinutes: { branchId: RZ, roomTypeId: t.roomTypeId, durationMinutes: t.durationMinutes } },
      update: { label: t.label, price: t.price, status: 'active', pernocta: t.pernocta },
      create: { branchId: RZ, roomTypeId: t.roomTypeId, label: t.label, durationMinutes: t.durationMinutes, price: t.price, status: 'active', pernocta: t.pernocta },
    });
  }

  // 4. Categorías + productos del almacén central (para ventas y solicitudes de recepción)
  const cats = [
    { id: 'rz-cat-aguas', name: 'Aguas y Refrescos' },
    { id: 'rz-cat-energ', name: 'Energizantes y rehidratantes' },
    { id: 'rz-cat-gall', name: 'Galletas' },
    { id: 'rz-cat-choc', name: 'Chocolates y Dulces' },
  ];
  for (const c of cats) await prisma.inventoryCategory.upsert({ where: { id: c.id }, update: { name: c.name }, create: { id: c.id, branchId: RZ, name: c.name } });
  const prods = [
    { id: 'rz-p-sanluis-sg', sku: 'PROD-001', name: 'San Luis SIN GAS', cat: 'rz-cat-aguas', venta: 3, compra: 1.24, stock: 60, reorder: 12 },
    { id: 'rz-p-sanluis-cg', sku: 'PROD-002', name: 'San Luis CON GAS', cat: 'rz-cat-aguas', venta: 3, compra: 1.2, stock: 60, reorder: 5 },
    { id: 'rz-p-coca', sku: 'PROD-004', name: 'Coca Cola', cat: 'rz-cat-aguas', venta: 4, compra: 2.62, stock: 50, reorder: 6 },
    { id: 'rz-p-inka', sku: 'PROD-005', name: 'Inka Cola', cat: 'rz-cat-aguas', venta: 4, compra: 2.5, stock: 50, reorder: 5 },
    { id: 'rz-p-fanta', sku: 'PROD-006', name: 'Fanta', cat: 'rz-cat-aguas', venta: 3, compra: 1.8, stock: 40, reorder: 5 },
    { id: 'rz-p-frugos', sku: 'PROD-009', name: 'Frugos del Valle 1 L', cat: 'rz-cat-aguas', venta: 6, compra: 3.5, stock: 30, reorder: 4 },
    { id: 'rz-p-sporade', sku: 'PROD-011', name: 'Sporade', cat: 'rz-cat-energ', venta: 3.5, compra: 2.37, stock: 40, reorder: 8 },
    { id: 'rz-p-gatorade', sku: 'PROD-012', name: 'Gatorade', cat: 'rz-cat-energ', venta: 3.5, compra: 2.4, stock: 40, reorder: 6 },
    { id: 'rz-p-volt', sku: 'PROD-013', name: 'Volt', cat: 'rz-cat-energ', venta: 3.5, compra: 2.3, stock: 50, reorder: 10 },
    { id: 'rz-p-morochas', sku: 'PROD-020', name: 'Morochas', cat: 'rz-cat-gall', venta: 1.5, compra: 0.8, stock: 60, reorder: 10 },
    { id: 'rz-p-oreo', sku: 'PROD-021', name: 'Oreo', cat: 'rz-cat-gall', venta: 1.5, compra: 0.9, stock: 50, reorder: 10 },
    { id: 'rz-p-bonbon', sku: 'PROD-030', name: 'Chupetin Bon Bon Bum', cat: 'rz-cat-choc', venta: 1, compra: 0.5, stock: 80, reorder: 15 },
    { id: 'rz-p-triangulo', sku: 'PROD-031', name: 'Triangulo', cat: 'rz-cat-choc', venta: 3, compra: 1.8, stock: 40, reorder: 6 },
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

  // 5. Almacén de RECEPCIÓN con un stock inicial (inventario de recepción)
  let recWh = await prisma.warehouse.findFirst({ where: { branchId: RZ, type: 'RECEPTION' } });
  if (!recWh) recWh = await prisma.warehouse.create({ data: { id: 'rz-wh-rec', branchId: RZ, name: 'Recepción', type: 'RECEPTION' } });
  const recStock: Record<string, number> = {
    'rz-p-sanluis-sg': 12, 'rz-p-coca': 10, 'rz-p-inka': 10, 'rz-p-sporade': 8, 'rz-p-volt': 12, 'rz-p-oreo': 10, 'rz-p-bonbon': 20,
  };
  for (const [pid, q] of Object.entries(recStock)) {
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: pid, warehouseId: recWh.id } },
      update: { quantity: q },
      create: { productId: pid, warehouseId: recWh.id, quantity: q },
    });
  }

  // 6. Permisos de recepción habilitados por el admin (para el flujo demo)
  for (const key of ['reception.allowChangeRoom', 'reception.allowWriteOff', 'reception.allowViewCash']) {
    await prisma.setting.upsert({
      where: { branchId_key: { branchId: RZ, key } }, update: { value: 'true' }, create: { branchId: RZ, key, value: 'true' },
    });
  }

  // 7. Ropa (linen): asegura los colores/amenities propios y luego deja el stock de TODA
  // la ropa consistente (almacén central ALMACEN + remanente por piso, sin suministros previos).
  const linen = [
    { id: 'rz-li-toa-verde', type: 'TOALLA', name: 'Verde Margarita', color: '#22c55e', reusable: true },
    { id: 'rz-li-sab-incaica', type: 'SABANA', name: 'Incaica Roja', color: '#ef4444', reusable: true },
    { id: 'rz-li-sab-azulbol', type: 'SABANA', name: 'Azul Bolas', color: '#3b82f6', reusable: true },
    { id: 'rz-li-amn-jabon', type: 'AMENITY', name: 'Jabón granel + papel fraccionado', color: '#fcd34d', reusable: false },
    { id: 'rz-li-amn-shampoo', type: 'AMENITY', name: 'Shampoo sachet', color: '#a78bfa', reusable: false },
  ];
  for (const l of linen) {
    await prisma.linenItem.upsert({
      where: { id: l.id }, update: { name: l.name, color: l.color, reusable: l.reusable },
      create: { id: l.id, branchId: RZ, type: l.type, name: l.name, color: l.color, reusable: l.reusable },
    });
  }
  // Reset consistente del stock de TODA la ropa activa (incluye la del seed base).
  const allLinen = await prisma.linenItem.findMany({ where: { branchId: RZ, status: 'active' } });
  for (const it of allLinen) {
    const remPiso = it.type === 'AMENITY' ? 6 : 10;
    // Almacén central (origen de los suministros del admin).
    await prisma.linenStock.upsert({
      where: { linenItemId_floor: { linenItemId: it.id, floor: 'ALMACEN' } },
      update: { rem: 50, sum: 0 },
      create: { branchId: RZ, linenItemId: it.id, floor: 'ALMACEN', rem: 50, sum: 0 },
    });
    // Remanente por piso (sum = 0: nada suministrado aún en este periodo).
    for (const floor of ['1', '2', '3']) {
      await prisma.linenStock.upsert({
        where: { linenItemId_floor: { linenItemId: it.id, floor } },
        update: { rem: remPiso, sum: 0 },
        create: { branchId: RZ, linenItemId: it.id, floor, rem: remPiso, sum: 0 },
      });
    }
  }

  // 8. Historial REAL de mantenimientos (Revisiones). Hab. 101: 1 preventivo con falla + 3 periódicos.
  const colab = (i: number): string | undefined => (i % 2 === 0 ? limpUser?.id : admin?.id) ?? undefined;
  const revs = [
    { id: 'rz-rev-1', roomId: 'rz-room-102', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: 'Todo conforme', at: ago(1 * HOUR) },
    { id: 'rz-rev-2', roomId: 'rz-room-103', status: 'ISSUE', tipoFalla: 'PAREDES: Pintura descascarada', acciones: ['Limpieza de paredes'], obs: 'Pared con manchas', at: ago(5 * HOUR) },
    { id: 'rz-rev-3', roomId: 'rz-room-203', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: null, at: ago(20 * HOUR) },
    { id: 'rz-rev-4', roomId: 'rz-room-303', status: 'ISSUE', tipoFalla: 'ELECTRICIDAD: Foco del baño quemado', acciones: ['Cambio de foco'], obs: 'Foco del baño quemado', at: ago(28 * HOUR) },
    { id: 'rz-rev-101a', roomId: 'rz-room-101', status: 'ISSUE', tipoFalla: 'ELECTRICIDAD/ILUMINACIÓN: Foco quemado en la habitación', acciones: [], obs: 'Se requiere cambiar el foco principal.', hasPhoto: true, at: ago(106 * HOUR) },
    { id: 'rz-rev-101b', roomId: 'rz-room-101', status: 'OK', tipoFalla: null, acciones: ['Limpieza de paredes'], obs: null, at: ago(5 * HOUR) },
    { id: 'rz-rev-101c', roomId: 'rz-room-101', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: null, at: ago(7 * HOUR) },
    { id: 'rz-rev-101d', roomId: 'rz-room-101', status: 'OK', tipoFalla: null, acciones: ['Cambio de cortinas'], obs: 'Cortinas repuestas.', at: ago(28 * HOUR) },
  ];
  const demoFotoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="#1f2937"/><rect x="20" y="20" width="280" height="180" rx="10" fill="#111827" stroke="#374151"/><circle cx="110" cy="95" r="34" fill="#fbbf24"/><rect x="95" y="130" width="130" height="14" rx="7" fill="#374151"/><rect x="95" y="155" width="90" height="12" rx="6" fill="#374151"/><text x="160" y="205" fill="#9ca3af" font-family="sans-serif" font-size="12" text-anchor="middle">Foto: foco quemado - Hab. 101</text></svg>`;
  const demoFoto = `data:image/svg+xml;base64,${Buffer.from(demoFotoSvg).toString('base64')}`;
  for (let i = 0; i < revs.length; i++) {
    const r = revs[i] as (typeof revs)[number] & { hasPhoto?: boolean };
    await prisma.revision.create({
      data: {
        id: r.id, branchId: RZ, roomId: r.roomId, status: r.status,
        notes: JSON.stringify({ tipoFalla: r.tipoFalla, acciones: r.acciones, observaciones: r.obs, hasPhoto: !!r.hasPhoto }),
        photo: r.hasPhoto ? demoFoto : null,
        createdByUserId: colab(i), createdAt: r.at,
      },
    });
  }

  // 9. Turno de limpieza ABIERTO para el usuario de limpieza
  if (limpUser) {
    await prisma.cleaningShift.updateMany({ where: { branchId: RZ, userId: limpUser.id, status: 'OPEN', id: { not: 'rz-shift-limp' } }, data: { status: 'CLOSED', closedAt: ago(3 * HOUR) } });
    await prisma.cleaningShift.upsert({
      where: { id: 'rz-shift-limp' },
      update: { status: 'OPEN', laundrySent: false, openedAt: ago(2 * HOUR), closedAt: null },
      create: { id: 'rz-shift-limp', branchId: RZ, userId: limpUser.id, shiftType: 'MANANA', status: 'OPEN', laundrySent: false, openedAt: ago(2 * HOUR) },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Demo RIZZOS LIMPIA y lista.
   Usuarios (Rizzos123!): admin@hotelsuite.local · recepcion@rizzos.local · limpieza@rizzos.local
   Habitaciones: todas DISPONIBLES (listas para un check-in real).
   Stock sincronizado: almacén central de productos + recepción + almacén central de ropa (ALMACEN) + remanente por piso.
   Historial de mantenimientos: ${revs.length} revisiones (Hab. 101 con foto).
   Turno de limpieza ABIERTO para limpieza@rizzos.local (sin tareas: se generan al usar el flujo).`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Demo RIZZOS falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
