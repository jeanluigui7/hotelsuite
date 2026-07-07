/**
 * RBAC catalog: modules × actions.
 * Single source of truth for permission seeding and `requirePermission` checks.
 */
export const MODULES = [
  'dashboard',
  'operations',
  'finance',
  'inventory',
  'logistics',
  'hr',
  'reports',
  'whatsapp',
  'settings',
  // Permisos dedicados (granularidad fina): crear/eliminar habitaciones y tipos de habitación.
  // Separados de 'operations'/'settings' para poder permitir tarifas pero no tipos, etc.
  'rooms',
  'roomtypes',
] as const;

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;

/** Name of the protected role with full access to everything. */
export const SUPER_ADMIN_ROLE = 'Super Admin';

export type AppModule = (typeof MODULES)[number];
export type AppAction = (typeof ACTIONS)[number];

/** Stable string key for a permission, e.g. "finance:create". */
export function permissionKey(module: AppModule | string, action: AppAction | string): string {
  return `${module}:${action}`;
}

/** Full cartesian catalog of permissions (used by the seed). */
export function allPermissions(): { module: AppModule; action: AppAction }[] {
  const result: { module: AppModule; action: AppAction }[] = [];
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      result.push({ module, action });
    }
  }
  return result;
}
