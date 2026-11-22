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
  // Mantenimiento: 'approve' = RESOLVER fallas (solo Admin + personal de mantenimiento).
  // Reportar falla sigue en 'operations:create' (sin regresión para Recepción/Limpieza).
  'maintenance',
  // Permisos dedicados (granularidad fina): crear/eliminar habitaciones y tipos de habitación.
  // Separados de 'operations'/'settings' para poder permitir tarifas pero no tipos, etc.
  'rooms',
  'roomtypes',
] as const;

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;

/** Name of the protected role with full access to everything. */
export const SUPER_ADMIN_ROLE = 'Super Admin';
export const GERENTE_ROLE = 'Gerente';
export const ENCARGADO_OPERACIONES_ROLE = 'Encargado de Operaciones';

/**
 * Jerarquía de GESTIÓN DE USUARIOS (no es RBAC de módulos). Número mayor = más autoridad.
 * Un usuario (que no sea Super Admin) solo puede:
 *   - ver y gestionar usuarios cuyo rol tenga rango <= al suyo (no ve/gestiona roles superiores);
 *   - asignar roles cuyo rango sea <= al suyo (nunca un rol superior ni elevar su propia jerarquía).
 * Los roles no listados caen en DEFAULT_ROLE_RANK (operativos: recepción, caja, limpieza, etc.).
 */
export const ROLE_RANK: Record<string, number> = {
  [SUPER_ADMIN_ROLE]: 100,
  [GERENTE_ROLE]: 80,
  [ENCARGADO_OPERACIONES_ROLE]: 60,
};
export const DEFAULT_ROLE_RANK = 20;

export function roleRank(roleName: string | null | undefined): number {
  if (!roleName) return DEFAULT_ROLE_RANK;
  return ROLE_RANK[roleName] ?? DEFAULT_ROLE_RANK;
}

/** Nombres de roles con rango ESTRICTAMENTE mayor al dado (los que un actor de ese rango no puede ver/asignar). */
export function roleNamesAboveRank(rank: number): string[] {
  return Object.entries(ROLE_RANK)
    .filter(([, r]) => r > rank)
    .map(([name]) => name);
}

/**
 * Roles cuyo acceso a CAJA está limitado a las cajas PENDIENTES de auditoría: en cuanto una caja
 * queda AUDITADA, pierden el acceso. No afecta a Super Admin, Gerente ni a Recepción/Caja.
 */
export const AUDIT_RESTRICTED_ROLES: ReadonlySet<string> = new Set([ENCARGADO_OPERACIONES_ROLE]);

/** true si el rol solo puede ver cajas no auditadas (ver AUDIT_RESTRICTED_ROLES). */
export function isAuditRestrictedRole(roleName: string | null | undefined): boolean {
  return !!roleName && AUDIT_RESTRICTED_ROLES.has(roleName);
}

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
