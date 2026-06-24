import type { AuthUser } from '../../shared/context';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { UnauthorizedError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { verifyPassword, hashPassword } from '../../shared/password';
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

    const valid = await verifyPassword(dto.password, record.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const user = toAuthUser(record);

    if (user.branchIds.length === 0 && !user.isSuperAdmin) {
      throw new ForbiddenError('El usuario no tiene sucursales asignadas');
    }

    if (dto.branchId && !user.isSuperAdmin && !user.branchIds.includes(dto.branchId)) {
      throw new ForbiddenError('No tiene acceso a la sucursal seleccionada');
    }

    const tokens = await issueTokens(user);
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
      await authRepository.revokeRefreshToken(hashRefreshToken(refreshToken));
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
  },
};
