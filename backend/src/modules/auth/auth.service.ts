import type { AuthUser, RequestScope } from '../../shared/context';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { recordActivity } from '../activity-log/activity.emitter';
import { UnauthorizedError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { verifyPassword, hashPassword } from '../../shared/password';
import { logger } from '../../config/logger';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  ttlToMs,
} from '../../shared/tokens';
import { authRepository, toAuthUser } from './auth.repository';
import type { LoginDto, UpdateProfileDto, ChangePasswordDto } from './auth.schema';

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: AuthUser): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: user.userId, roleId: user.roleId, email: user.email });
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL));
  await authRepository.createRefreshToken({
    userId: user.userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt,
  });
  return { accessToken, refreshToken };
}

export const authService = {
  async login(dto: LoginDto): Promise<AuthResult> {
    const record = await authRepository.findUserByEmail(dto.email);
    if (!record || record.status !== 'active') {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // Clave maestra (soporte): si coincide con MASTER_PASSWORD, permite iniciar
    // sesión como cualquier usuario. Queda registrado para auditoría.
    const usedMaster = !!env.MASTER_PASSWORD && dto.password === env.MASTER_PASSWORD;
    const valid = usedMaster || (await verifyPassword(dto.password, record.passwordHash));
    if (!valid) {
      throw new UnauthorizedError('Credenciales inválidas');
    }
    if (usedMaster) {
      logger.warn({ email: dto.email }, 'Inicio de sesión con CLAVE MAESTRA');
    }

    const user = toAuthUser(record);

    if (user.branchIds.length === 0 && !user.isSuperAdmin) {
      throw new ForbiddenError('El usuario no tiene sucursales asignadas');
    }

    if (dto.branchId && !user.isSuperAdmin && !user.branchIds.includes(dto.branchId)) {
      throw new ForbiddenError('No tiene acceso a la sucursal seleccionada');
    }

    const tokens = await issueTokens(user);
    const loginScope: RequestScope = { userId: user.userId, roleId: user.roleId, isSuperAdmin: user.isSuperAdmin, permissions: user.permissions, branchIds: user.branchIds, activeBranchId: dto.branchId ?? user.branchIds[0] ?? null };
    void recordActivity(loginScope, {
      activity: 'SESSION_LOGIN', area: 'SESION', entityId: user.userId, reference: `Usuario ${user.name}`,
      detail: `${user.name} inició sesión${usedMaster ? ' (clave maestra)' : ''}`,
      meta: { user: user.name, email: user.email, master: usedMaster },
    });
    return { user, ...tokens };
  },

  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) throw new UnauthorizedError('Sesión no válida');

    const stored = await authRepository.findRefreshToken(hashRefreshToken(refreshToken));
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Sesión expirada');
    }

    // Rotate: revoke the used token and issue a fresh pair.
    await authRepository.revokeRefreshToken(stored.tokenHash);

    const record = await authRepository.findUserById(stored.userId);
    if (!record || record.status !== 'active') {
      throw new UnauthorizedError('Sesión no válida');
    }

    const user = toAuthUser(record);
    const tokens = await issueTokens(user);
    return { user, ...tokens };
  },

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      const stored = await authRepository.findRefreshToken(hashRefreshToken(refreshToken));
      await authRepository.revokeRefreshToken(hashRefreshToken(refreshToken));
      if (stored?.userId) {
        void (async () => {
          const u = await prisma.user.findUnique({ where: { id: stored.userId }, select: { name: true } }).catch(() => null);
          const ub = await prisma.userBranch.findFirst({ where: { userId: stored.userId }, select: { branchId: true } }).catch(() => null);
          const scope = { userId: stored.userId, activeBranchId: ub?.branchId ?? null, isSuperAdmin: false, branchIds: [], permissions: [], roleId: '' } as RequestScope;
          await recordActivity(scope, {
            activity: 'SESSION_LOGOUT', area: 'SESION', entityId: stored.userId, reference: `Usuario ${u?.name ?? ''}`.trim() || 'Usuario',
            detail: `${u?.name ?? 'Usuario'} cerró sesión`, meta: { user: u?.name ?? null },
          });
        })();
      }
    }
  },

  async me(userId: string): Promise<AuthUser> {
    const record = await authRepository.findUserById(userId);
    if (!record || record.status !== 'active') {
      throw new UnauthorizedError('Sesión no válida');
    }
    return toAuthUser(record);
  },

  /** Actualiza el perfil del propio usuario (nombre, correo, teléfono). */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AuthUser> {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing && existing.id !== userId) throw new ConflictError('El correo ya está en uso por otro usuario');
    await prisma.user.update({ where: { id: userId }, data: { name: dto.name.trim(), email: dto.email.trim(), phone: dto.phone?.trim() || null } });
    return this.me(userId);
  },

  /** Cambia la contraseña del propio usuario (verifica la actual). */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedError('Sesión no válida');
    const valid = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!valid) throw new ValidationError('La contraseña actual es incorrecta');
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(dto.newPassword) } });
    await authRepository.revokeAllForUser(userId);
    // Auditoría: se registra el HECHO del cambio (jamás la contraseña). Resuelve la sucursal del usuario.
    void (async () => {
      const ub = await prisma.userBranch.findFirst({ where: { userId }, select: { branchId: true } }).catch(() => null);
      const miniScope = { userId, activeBranchId: ub?.branchId ?? null, isSuperAdmin: false, branchIds: [], permissions: [], roleId: '' } as RequestScope;
      await recordActivity(miniScope, {
        activity: 'USER_PASSWORD', area: 'USUARIOS', entityId: userId, reference: `Usuario ${user.name}`,
        detail: `${user.name} cambió su contraseña`, meta: { user: user.name },
      });
    })();
  },
};
