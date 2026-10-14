import { prisma } from '../../config/prisma';
import { ForbiddenError } from '../../shared/errors';
import { ALL_DEVICE_TYPES, DEVICE_LABELS, classifyDevice, type DeviceType } from '../../shared/device';
import { SUPER_ADMIN_ROLE } from '../../shared/rbac';

/** Clave del ajuste GLOBAL (branchId NULL) que guarda la matriz perfil → dispositivos permitidos. */
const KEY = 'security.deviceAccess';

/** Config persistida: por cada rol, la lista de tipos de dispositivo permitidos. */
export interface DeviceAccessConfig {
  byRole: Record<string, DeviceType[]>;
}

async function readGlobal(key: string): Promise<string | null> {
  const s = await prisma.setting.findFirst({ where: { branchId: null, key } });
  return s?.value ?? null;
}
async function writeGlobal(key: string, value: string): Promise<void> {
  const existing = await prisma.setting.findFirst({ where: { branchId: null, key } });
  if (existing) await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  else await prisma.setting.create({ data: { branchId: null, key, value } });
}

function sanitize(list: unknown): DeviceType[] {
  if (!Array.isArray(list)) return [];
  return ALL_DEVICE_TYPES.filter((d) => list.includes(d));
}

async function loadConfig(): Promise<DeviceAccessConfig> {
  const raw = await readGlobal(KEY);
  if (!raw) return { byRole: {} };
  try {
    const parsed = JSON.parse(raw) as { byRole?: Record<string, unknown> };
    const byRole: Record<string, DeviceType[]> = {};
    for (const [roleId, list] of Object.entries(parsed.byRole ?? {})) byRole[roleId] = sanitize(list);
    return { byRole };
  } catch {
    return { byRole: {} };
  }
}

export const deviceAccessService = {
  /** Datos para la pantalla de configuración: roles + matriz actual + catálogo de dispositivos. */
  async getForUi() {
    const [roles, config] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      loadConfig(),
    ]);
    return {
      deviceTypes: ALL_DEVICE_TYPES.map((value) => ({ value, label: DEVICE_LABELS[value] })),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        isSuperAdmin: r.name === SUPER_ADMIN_ROLE,
        // Rol sin configurar => todos permitidos (default pedido).
        allowed: config.byRole[r.id] ?? ALL_DEVICE_TYPES,
      })),
    };
  },

  /** Guarda la matriz. El Super Admin nunca se restringe (salvaguarda anti-bloqueo). */
  async save(byRoleInput: Record<string, DeviceType[]>) {
    const superRole = await prisma.role.findFirst({ where: { name: SUPER_ADMIN_ROLE }, select: { id: true } });
    const byRole: Record<string, DeviceType[]> = {};
    for (const [roleId, list] of Object.entries(byRoleInput)) {
      if (superRole && roleId === superRole.id) continue; // Super Admin siempre con todos
      byRole[roleId] = sanitize(list);
    }
    await writeGlobal(KEY, JSON.stringify({ byRole }));
    return this.getForUi();
  },

  /**
   * Enforcement en el login: lanza ForbiddenError si el perfil del usuario no puede ingresar
   * desde el dispositivo detectado. Super Admin siempre pasa; lista vacía/sin config = todos (fail-open
   * para evitar bloqueos accidentales).
   */
  async assertAllowed(
    user: { roleId: string; roleName: string; isSuperAdmin: boolean },
    userAgent: string | undefined | null,
  ): Promise<void> {
    if (user.isSuperAdmin) return;
    const config = await loadConfig();
    const allowed = config.byRole[user.roleId];
    if (!allowed || allowed.length === 0) return; // sin restricción configurada
    const device = classifyDevice(userAgent);
    if (allowed.includes(device)) return;
    const allowedLabels = allowed.map((d) => DEVICE_LABELS[d]).join(', ');
    throw new ForbiddenError(
      `Tu perfil (${user.roleName}) no puede ingresar desde ${DEVICE_LABELS[device]}. Dispositivos permitidos: ${allowedLabels}.`,
    );
  },
};
