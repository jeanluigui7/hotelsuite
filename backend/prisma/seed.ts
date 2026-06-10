/**
 * Idempotent seed: demo branch, full permission catalog, base roles and a Super Admin user.
 * Safe to run multiple times (everything is upserted by a stable key).
 *
 * Override admin credentials with env vars SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ACTIONS, MODULES, allPermissions, type AppModule } from '../src/shared/rbac';

const prisma = new PrismaClient();

const DEMO_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

const SUPER_ADMIN = 'Super Admin';

// Base roles and the modules they can, at minimum, view. Super Admin gets everything.
const BASE_ROLES: { name: string; description: string; modules: AppModule[] }[] = [
  {
    name: 'Gerente',
    description: 'Administrador de sucursal',
    modules: ['dashboard', 'operations', 'finance', 'inventory', 'logistics', 'hr', 'reports'],
  },
  {
    name: 'Recepcionista',
    description: 'Operación de recepción: check-in/out, ventas, caja de su turno',
    modules: ['dashboard', 'operations', 'finance'],
  },
  {
    name: 'Caja',
    description: 'Caja, comprobantes y arqueo de turno',
    modules: ['dashboard', 'finance'],
  },
  {
    name: 'Supervisor de Limpieza',
    description: 'Asignación e inspección de limpieza',
    modules: ['dashboard', 'operations', 'inventory'],
  },
  {
    name: 'Personal de Limpieza',
    description: 'Tareas de limpieza asignadas',
    modules: ['operations'],
  },
  {
    name: 'Logística',
    description: 'Inventario, kardex, proveedores, reposición',
    modules: ['dashboard', 'inventory', 'logistics', 'reports'],
  },
];

async function main(): Promise<void> {
  // 1. Demo branch
  const branch = await prisma.branch.upsert({
    where: { id: DEMO_BRANCH_ID },
    update: {},
    create: {
      id: DEMO_BRANCH_ID,
      name: 'Sucursal Demo',
      address: 'Av. Principal 123',
      taxId: '20123456789',
      currency: 'PEN',
      cutoffHour: 6,
    },
  });

  // 2. Permission catalog (module × action)
  for (const { module, action } of allPermissions()) {
    await prisma.permission.upsert({
      where: { module_action: { module, action } },
      update: {},
      create: { module, action },
    });
  }
  const allPerms = await prisma.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [`${p.module}:${p.action}`, p.id]));

  // 3. Super Admin role with every permission
  const superAdminRole = await prisma.role.upsert({
    where: { name: SUPER_ADMIN },
    update: { isSystem: true },
    create: { name: SUPER_ADMIN, description: 'Acceso total a todas las sucursales', isSystem: true },
  });
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  // 4. Base roles (view on their modules + create/edit on operational ones)
  for (const def of BASE_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { description: def.description },
      create: { name: def.name, description: def.description },
    });
    for (const module of def.modules) {
      // 'view' always; 'create'/'edit' for operational modules
      const grant = module === 'reports' || module === 'dashboard' ? ['view'] : ['view', 'create', 'edit'];
      for (const action of ACTIONS) {
        if (!grant.includes(action)) continue;
        const permId = permByKey.get(`${module}:${action}`);
        if (!permId) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          update: {},
          create: { roleId: role.id, permissionId: permId },
        });
      }
    }
  }

  // 5. Super Admin user
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@hotelsuite.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { roleId: superAdminRole.id, status: 'active' },
    create: { name: 'Super Admin', email, passwordHash, roleId: superAdminRole.id },
  });

  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: admin.id, branchId: branch.id } },
    update: {},
    create: { userId: admin.id, branchId: branch.id },
  });

  // 6. Demo catalogs (Tanda 2A)
  const attributeDefs = [
    { id: '00000000-0000-0000-0000-0000000000a1', name: 'TV', icon: 'pi pi-desktop' },
    { id: '00000000-0000-0000-0000-0000000000a2', name: 'Aire acondicionado', icon: 'pi pi-cloud' },
    { id: '00000000-0000-0000-0000-0000000000a3', name: 'Jacuzzi', icon: 'pi pi-star' },
  ];
  for (const attr of attributeDefs) {
    await prisma.roomAttribute.upsert({
      where: { id: attr.id },
      update: { name: attr.name, icon: attr.icon },
      create: { id: attr.id, branchId: branch.id, name: attr.name, icon: attr.icon },
    });
  }

  const roomTypeId = '00000000-0000-0000-0000-0000000000b1';
  await prisma.roomType.upsert({
    where: { id: roomTypeId },
    update: { name: 'Matrimonial', capacity: 2, basePrice: 60 },
    create: {
      id: roomTypeId,
      branchId: branch.id,
      name: 'Matrimonial',
      description: 'Habitación matrimonial estándar',
      capacity: 2,
      basePrice: 60,
    },
  });

  for (const attr of attributeDefs.slice(0, 2)) {
    await prisma.roomTypeAttribute.upsert({
      where: { roomTypeId_attributeId: { roomTypeId, attributeId: attr.id } },
      update: {},
      create: { roomTypeId, attributeId: attr.id },
    });
  }

  await prisma.clientTier.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000c1' },
    update: { name: 'VIP', discountPercent: 10 },
    create: {
      id: '00000000-0000-0000-0000-0000000000c1',
      branchId: branch.id,
      name: 'VIP',
      discountPercent: 10,
      description: 'Cliente frecuente',
    },
  });

  const rateDefs = [
    { label: '3 horas', durationMinutes: 180, price: 35 },
    { label: '12 horas', durationMinutes: 720, price: 50 },
    { label: 'Noche (24h)', durationMinutes: 1440, price: 60 },
  ];
  for (const rate of rateDefs) {
    await prisma.rate.upsert({
      where: {
        branchId_roomTypeId_durationMinutes: {
          branchId: branch.id,
          roomTypeId,
          durationMinutes: rate.durationMinutes,
        },
      },
      update: { label: rate.label, price: rate.price },
      create: { branchId: branch.id, roomTypeId, ...rate },
    });
  }

  // 7. Demo catalogs (Tanda 2B)
  await prisma.area.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000d1' },
    update: { name: 'Recepción' },
    create: { id: '00000000-0000-0000-0000-0000000000d1', branchId: branch.id, name: 'Recepción' },
  });
  await prisma.inventoryCategory.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000e1' },
    update: { name: 'Bebidas' },
    create: { id: '00000000-0000-0000-0000-0000000000e1', branchId: branch.id, name: 'Bebidas' },
  });

  const itemDefs = [
    { id: '00000000-0000-0000-0000-0000000000f1', kind: 'CHECKIN', name: 'Toalla extra', price: 5 },
    { id: '00000000-0000-0000-0000-0000000000f2', kind: 'RATE', name: 'Hora adicional', price: 15 },
    { id: '00000000-0000-0000-0000-0000000000f3', kind: 'SERVICE_PENALTY', name: 'Penalidad por daño', price: 50 },
    { id: '00000000-0000-0000-0000-0000000000f4', kind: 'MAINTENANCE', name: 'Cambio de foco', price: 0 },
  ];
  for (const item of itemDefs) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: { name: item.name, price: item.price },
      create: { id: item.id, branchId: branch.id, kind: item.kind, name: item.name, price: item.price },
    });
  }

  await prisma.schedule.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000aa' },
    update: { name: 'Turno Mañana' },
    create: {
      id: '00000000-0000-0000-0000-0000000000aa',
      branchId: branch.id,
      name: 'Turno Mañana',
      startTime: '07:00',
      endTime: '15:00',
      daysOfWeek: '1,2,3,4,5,6,7',
    },
  });

  // 8. Demo rooms (FASE 3)
  const roomDefs = [
    { id: '00000000-0000-0000-0000-0000000bb101', number: '101', floor: '1' },
    { id: '00000000-0000-0000-0000-0000000bb102', number: '102', floor: '1' },
    { id: '00000000-0000-0000-0000-0000000bb201', number: '201', floor: '2' },
  ];
  for (const room of roomDefs) {
    await prisma.room.upsert({
      where: { id: room.id },
      update: { number: room.number, floor: room.floor },
      create: { id: room.id, branchId: branch.id, roomTypeId, number: room.number, floor: room.floor },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Seed completo.
   Sucursal:  ${branch.name} (${branch.id})
   Catálogos: 1 tipo de habitación, ${attributeDefs.length} atributos, 1 tier, ${rateDefs.length} tarifas
   2B:        1 área, 1 categoría, ${itemDefs.length} items, 1 horario
   3A:        ${roomDefs.length} habitaciones
   Permisos:  ${allPerms.length} (${MODULES.length} módulos × ${ACTIONS.length} acciones)
   Roles:     ${SUPER_ADMIN} + ${BASE_ROLES.length} base
   Usuario:   ${email}  /  contraseña: ${process.env.SEED_ADMIN_PASSWORD ? '(de SEED_ADMIN_PASSWORD)' : password}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed falló:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
