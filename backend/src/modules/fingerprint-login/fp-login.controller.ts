import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../../config/env';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { ttlToMs } from '../../shared/tokens';
import { authService } from '../auth/auth.service';
import { fpLoginService } from './fp-login.service';
import { loginModeSchema, loginRequestSchema, saveLoginConfigSchema, setUserPinSchema } from './fp-login.schema';

function refreshCookieOptions(): CookieOptions {
  const secure = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction;
  return { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth', maxAge: ttlToMs(env.JWT_REFRESH_TTL) };
}
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}
function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
}

export const fpLoginController = {
  // ── Login por huella (público) ──
  async loginMode(req: Request, res: Response): Promise<void> {
    const dto = loginModeSchema.parse(req.body);
    res.status(200).json(ok(await fpLoginService.loginMode(dto.email)));
  },
  async loginRequest(req: Request, res: Response): Promise<void> {
    const dto = loginRequestSchema.parse(req.body);
    res.status(201).json(ok(await fpLoginService.createLoginRequest(dto.email)));
  },
  async loginPoll(req: Request, res: Response): Promise<void> {
    const result = await fpLoginService.pollLogin(req.params.id, req.headers['user-agent']);
    if (result.status === 'authenticated' && result.refreshToken) {
      setRefreshCookie(res, result.refreshToken);
      res.status(200).json(ok({ status: result.status, user: result.user, accessToken: result.accessToken, shiftStarted: result.shiftStarted }));
      return;
    }
    res.status(200).json(ok({ status: result.status, remainingMs: result.remainingMs }));
  },
  async cancel(req: Request, res: Response): Promise<void> {
    res.status(200).json(ok(fpLoginService.cancel(req.params.id)));
  },

  // ── Logout / fin de turno por huella (autenticado) ──
  async logoutRequest(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await fpLoginService.createLogoutRequest(req.scope)));
  },
  async logoutPoll(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const result = await fpLoginService.pollLogout(req.params.id, req.scope);
    if (result.status === 'authenticated') {
      const token = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
      await authService.logout(token);
      clearRefreshCookie(res);
    }
    res.status(200).json(ok({ status: result.status, remainingMs: result.remainingMs }));
  },

  // ── Configuración de roles que exigen huella (settings) ──
  async getConfig(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await fpLoginService.config.getForUi()));
  },
  async saveConfig(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = saveLoginConfigSchema.parse(req.body);
    res.status(200).json(ok(await fpLoginService.config.save(dto.roleIds)));
  },

  // ── ID biométrico del usuario desde RRHH (hr) ──
  async getUserPin(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await fpLoginService.getUserPin(req.params.userId)));
  },
  async setUserPin(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = setUserPinSchema.parse(req.body);
    res.status(200).json(ok(await fpLoginService.setUserPin(req.params.userId, dto.pin)));
  },
};
