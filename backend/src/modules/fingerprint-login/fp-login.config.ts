import { prisma } from '../../config/prisma';
import { SUPER_ADMIN_ROLE } from '../../shared/rbac';

/**
 * Configuración del "modo huellero obligatorio" POR ROL: qué roles deben ingresar (y salir) con huella
 * en lugar de contraseña. Se guarda en un Setting GLOBAL (branchId NULL) con un arreglo JSON de roleIds.
 * El Super Admin JAMÁS se exige por huella (salvaguarda anti-bloqueo, igual que el acceso por dispositivo).
 *
 * Vive en su propio archivo SIN dependencias de auth/turnos para que tanto `authService` (bloqueo de la
 * ruta de contraseña) como `fpLoginService` puedan importarlo sin ciclos.
 */

const KEY = 'biometrics.login.requiredRoles';

async function readGlobal(key: string): Promise<string | null> {
  const s = await prisma.setting.findFirst({ where: { branchId: null, key } });
  return s?.value ?? null;
}
async function writeGlobal(key: string, value: string): Promise<void> {
  const existing = await prisma.setting.findFirst({ where: { branchId: null, key } });
  if (existing) await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  else await prisma.setting.create({ data: { branchId: null, key, value } });
}

export async function readRequiredRoleIds(): Promise<string[]> {
  const raw = await readGlobal(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function roleRequiresFingerprint(roleId: string): Promise<boolean> {
  const ids = await readRequiredRoleIds();
  return ids.includes(roleId);
}

export const fpLoginConfig = {
  /** Datos para la pantalla de configuración: roles + marca de cuáles exigen huella. */
  async getForUi() {
    const [roles, ids] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      readRequiredRoleIds(),
    ]);
    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        isSuperAdmin: r.name === SUPER_ADMIN_ROLE,
        required: ids.includes(r.id),
      })),
    };
  },

  /** Guarda la lista de roles que exigen huella (nunca incluye al Super Admin). */
  async save(roleIds: string[]) {
    const superRole = await prisma.role.findFirst({ where: { name: SUPER_ADMIN_ROLE }, select: { id: true } });
    const clean = [...new Set((roleIds ?? []).filter((x) => typeof x === 'string'))].filter(
      (id) => !superRole || id !== superRole.id,
    );
    await writeGlobal(KEY, JSON.stringify(clean));
    return this.getForUi();
  },

  readRequiredRoleIds,
  roleRequiresFingerprint,
};
