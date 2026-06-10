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

  // eslint-disable-next-line no-console
  console.log(`✅ Seed completo.
   Sucursal:  ${branch.name} (${branch.id})
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
