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

  // El recepcionista necesita ver inventario (menú "Inventario de Limpieza").
  await ensureRolePermission(recepRole.id, 'inventory', 'view');

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
  // Ajusta estados de las habitaciones base para variar el tablero
  await prisma.room.update({ where: { id: 'rz-room-102' }, data: { status: 'CLEANING' } });
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
    await prisma.cleaningShift.upsert({
      where: { id: 'rz-shift-limp' },
      update: { status: 'OPEN', laundrySent: false },
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
  }

  // 6. Revisiones de mantenimiento (para poblar la tabla "Revisiones de Mantenimiento")
  const admin = await prisma.user.findUnique({ where: { email: 'admin@hotelsuite.local' } });
  const colab = (i: number): string | undefined => (i % 2 === 0 ? limpUser?.id : admin?.id) ?? undefined;
  const revs = [
    { id: 'rz-rev-1', roomId: 'rz-room-102', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: 'Todo conforme', at: ago(1 * HOUR) },
    { id: 'rz-rev-2', roomId: 'rz-room-103', status: 'ISSUE', tipoFalla: 'Pintura/Paredes', acciones: ['Limpieza de paredes'], obs: 'Pared con manchas', at: ago(5 * HOUR) },
    { id: 'rz-rev-3', roomId: 'rz-room-203', status: 'OK', tipoFalla: null, acciones: ['Revisión general'], obs: null, at: ago(20 * HOUR) },
    { id: 'rz-rev-4', roomId: 'rz-room-303', status: 'ISSUE', tipoFalla: 'Electricidad', acciones: ['Cambio de foco'], obs: 'Foco del baño quemado', at: ago(28 * HOUR) },
  ];
  for (let i = 0; i < revs.length; i++) {
    const r = revs[i];
    await prisma.revision.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id, branchId: RZ, roomId: r.roomId, status: r.status,
        notes: JSON.stringify({ tipoFalla: r.tipoFalla, acciones: r.acciones, observaciones: r.obs, photo: null }),
        createdByUserId: colab(i), createdAt: r.at,
      },
    });
  }

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
