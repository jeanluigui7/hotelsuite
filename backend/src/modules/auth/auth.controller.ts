import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../../config/env';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { ttlToMs } from '../../shared/tokens';
import { authService } from './auth.service';
import { loginSchema } from './auth.schema';

function refreshCookieOptions(): CookieOptions {
  // secure sigue a NODE_ENV salvo que COOKIE_SECURE lo fuerce (p. ej. preview por HTTP).
  const secure = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction;
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: ttlToMs(env.JWT_REFRESH_TTL),
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const dto = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(dto);
    setRefreshCookie(res, refreshToken);
    res.status(200).json(ok({ user, accessToken }));
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
    const { user, accessToken, refreshToken } = await authService.refresh(token);
    setRefreshCookie(res, refreshToken);
    res.status(200).json(ok({ user, accessToken }));
  },

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
    await authService.logout(token);
    clearRefreshCookie(res);
    res.status(200).json(ok({ success: true }));
  },

  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const user = await authService.me(req.user.userId);
    res.status(200).json(ok({ user }));
  },
};
