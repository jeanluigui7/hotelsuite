import type { AuthUser, RequestScope } from '../../shared/context';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors';
import { SUPER_ADMIN_ROLE } from '../../shared/rbac';
import { authService } from '../auth/auth.service';
import { workShiftsService } from '../work-shifts/work-shifts.service';
import { biometricsRepository } from '../biometrics/biometrics.repository';
import { fpLoginConfig } from './fp-login.config';
import { fpAuthStore } from './fp-auth.store';

const ADMS_SERIAL_PREFIX = 'biometrics.adms.serial.';

type LoginMode = { mode: 'password' } | { mode: 'fingerprint'; name: string };
type PollStatus = 'pending' | 'authenticated' | 'expired' | 'cancelled';

function scopeFromUser(user: AuthUser, branchId: string): RequestScope {
  return {
    userId: user.userId,
    roleId: user.roleId,
    roleName: user.roleName,
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.permissions,
    branchIds: user.branchIds,
    activeBranchId: branchId,
  };
}

const isCleaningRole = (roleName: string): boolean => /limpieza/i.test(roleName);

/** Resuelve el huellero del usuario: un equipo en alguna de sus sucursales, prefiriendo el vinculado por ADMS. */
async function resolveDeviceForUser(branchIds: string[]): Promise<{ deviceId: string; branchId: string } | null> {
  if (branchIds.length === 0) return null;
  const devices = await prisma.biometricDevice.findMany({ where: { branchId: { in: branchIds } } });
  if (devices.length === 0) return null;
  const serials = await prisma.setting.findMany({ where: { key: { startsWith: ADMS_SERIAL_PREFIX } } });
  const bound = new Set(serials.filter((s) => (s.value ?? '').trim()).map((s) => s.key.slice(ADMS_SERIAL_PREFIX.length)));
  const chosen = devices.find((d) => bound.has(d.id)) ?? devices[0];
  return { deviceId: chosen.id, branchId: chosen.branchId };
}

export const fpLoginService = {
  config: fpLoginConfig,

  /** (Pre-auth) ¿Este usuario ingresa con contraseña o con huella? Usuario desconocido → 'password' (no filtra existencia). */
  async loginMode(email: string): Promise<LoginMode> {
    const clean = email.trim().toLowerCase();
    if (!clean) return { mode: 'password' };
    const user = await prisma.user.findUnique({ where: { email: clean }, include: { role: true } });
    if (!user || user.status !== 'active' || user.role.name === SUPER_ADMIN_ROLE) return { mode: 'password' };
    if (!(await fpLoginConfig.roleRequiresFingerprint(user.roleId))) return { mode: 'password' };
    return { mode: 'fingerprint', name: user.name };
  },

  /** (Pre-auth) Abre una solicitud de login por huella para el usuario; el equipo luego empuja la marca. */
  async createLoginRequest(email: string) {
    const clean = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: clean }, include: { role: true, branches: true } });
    if (!user || user.status !== 'active') throw new UnauthorizedError('Usuario no válido');
    if (user.role.name === SUPER_ADMIN_ROLE || !(await fpLoginConfig.roleRequiresFingerprint(user.roleId))) {
      throw new ValidationError('Este usuario no usa ingreso por huella');
    }
    const dev = await resolveDeviceForUser(user.branches.map((b) => b.branchId));
    if (!dev) throw new ValidationError('No hay un huellero configurado para tu sucursal. Avisa al administrador.');
    const req = fpAuthStore.create({ userId: user.id, deviceId: dev.deviceId, branchId: dev.branchId, op: 'LOGIN' });
    return { requestId: req.id, name: user.name, expiresInMs: req.expiresAt - Date.now() };
  },

  /** (Pre-auth) Sondeo del modal. Al autenticar, entrega la sesión UNA vez e inicia el turno (recepción). */
  async pollLogin(requestId: string, userAgent?: string): Promise<{
    status: PollStatus;
    remainingMs?: number;
    user?: AuthUser;
    accessToken?: string;
    refreshToken?: string;
    shiftStarted?: boolean;
  }> {
    const r = fpAuthStore.get(requestId);
    if (!r || r.op !== 'LOGIN') return { status: 'expired' };
    if (r.status === 'pending') return { status: 'pending', remainingMs: Math.max(0, r.expiresAt - Date.now()) };
    if (r.status === 'authenticated') {
      fpAuthStore.markConsumed(requestId);
      const result = await authService.loginByUserId(r.userId, userAgent, 'huella');
      let shiftStarted = false;
      if (!isCleaningRole(result.user.roleName)) {
        try {
          await workShiftsService.start(scopeFromUser(result.user, r.branchId));
          shiftStarted = true;
        } catch {
          /* inicio de turno best-effort: no bloquea el login */
        }
      }
      return { status: 'authenticated', user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, shiftStarted };
    }
    return { status: r.status === 'cancelled' ? 'cancelled' : 'expired' };
  },

  cancel(requestId: string): { ok: true } {
    fpAuthStore.cancel(requestId);
    return { ok: true };
  },

  // ── Logout / fin de turno por huella (usuario autenticado) ──

  /** Abre una solicitud de logout por huella. Bloquea antes si hay caja abierta o lavandería pendiente. */
  async createLogoutRequest(scope: RequestScope) {
    const reason = await workShiftsService.logoutBlockReasonForFingerprint(scope.userId);
    if (reason) throw new ConflictError(reason);
    const user = await prisma.user.findUnique({ where: { id: scope.userId }, include: { branches: true } });
    if (!user) throw new UnauthorizedError('Usuario no válido');
    const dev = await resolveDeviceForUser(user.branches.map((b) => b.branchId));
    if (!dev) throw new ValidationError('No hay un huellero configurado para tu sucursal.');
    const req = fpAuthStore.create({ userId: scope.userId, deviceId: dev.deviceId, branchId: dev.branchId, op: 'LOGOUT' });
    return { requestId: req.id, name: user.name, expiresInMs: req.expiresAt - Date.now() };
  },

  /** (Auth) Sondeo del modal de logout. Al autenticar, finaliza el turno de recepción (si hay). El controller cierra la sesión. */
  async pollLogout(requestId: string, scope: RequestScope): Promise<{ status: PollStatus; remainingMs?: number }> {
    const r = fpAuthStore.get(requestId);
    if (!r || r.op !== 'LOGOUT' || r.userId !== scope.userId) return { status: 'expired' };
    if (r.status === 'pending') return { status: 'pending', remainingMs: Math.max(0, r.expiresAt - Date.now()) };
    if (r.status === 'authenticated') {
      fpAuthStore.markConsumed(requestId);
      const ws = await workShiftsService.hasActiveByUser(scope.userId);
      if (ws) await workShiftsService.end(scope); // lanza 409 si la caja sigue abierta
      const reason = await workShiftsService.logoutBlockReasonForFingerprint(scope.userId);
      if (reason) throw new ConflictError(reason);
      return { status: 'authenticated' };
    }
    return { status: r.status === 'cancelled' ? 'cancelled' : 'expired' };
  },

  // ── Asignación del "ID biométrico" desde RRHH › Usuarios ──

  /** Devuelve el PIN (ID del equipo) con el que el usuario está enrolado en el huellero de su sucursal. */
  async getUserPin(userId: string): Promise<{ deviceId: string | null; pin: string | null; deviceName: string | null }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { branches: true } });
    if (!user) throw new NotFoundError('Usuario no encontrado');
    const dev = await resolveDeviceForUser(user.branches.map((b) => b.branchId));
    if (!dev) return { deviceId: null, pin: null, deviceName: null };
    const device = await biometricsRepository.findDevice(dev.deviceId);
    const enrollment = await prisma.deviceEnrollment.findFirst({ where: { deviceId: dev.deviceId, userId } });
    return { deviceId: dev.deviceId, pin: enrollment?.deviceUserId ?? null, deviceName: device?.name ?? null };
  },

  /** Crea/actualiza/borra el enrolamiento (PIN↔usuario) del huellero de la sucursal del usuario. */
  async setUserPin(userId: string, pinRaw: string): Promise<{ deviceId: string | null; pin: string | null }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { branches: true } });
    if (!user) throw new NotFoundError('Usuario no encontrado');
    const dev = await resolveDeviceForUser(user.branches.map((b) => b.branchId));
    if (!dev) throw new ValidationError('No hay un huellero configurado para la sucursal del usuario.');
    const pin = pinRaw.trim();
    const existingForUser = await prisma.deviceEnrollment.findFirst({ where: { deviceId: dev.deviceId, userId } });

    // Vacío → quitar el enrolamiento del usuario (si lo hubiera).
    if (!pin) {
      if (existingForUser) await prisma.deviceEnrollment.delete({ where: { id: existingForUser.id } });
      return { deviceId: dev.deviceId, pin: null };
    }

    // El PIN no puede pertenecer a OTRO usuario en el mismo equipo.
    const owner = await biometricsRepository.findEnrollment(dev.deviceId, pin);
    if (owner && owner.userId !== userId) {
      throw new ConflictError('Ese ID biométrico ya está asignado a otro usuario en el huellero.');
    }
    if (existingForUser) {
      const updated = await prisma.deviceEnrollment.update({ where: { id: existingForUser.id }, data: { deviceUserId: pin, name: user.name } });
      return { deviceId: dev.deviceId, pin: updated.deviceUserId };
    }
    const created = await prisma.deviceEnrollment.create({ data: { deviceId: dev.deviceId, userId, deviceUserId: pin, name: user.name } });
    return { deviceId: dev.deviceId, pin: created.deviceUserId };
  },
};
