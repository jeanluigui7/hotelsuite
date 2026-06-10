import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../shared/errors';
import { verifyAccessToken } from '../shared/tokens';
import { authService } from '../modules/auth/auth.service';

/**
 * Verifies the Bearer access token and loads the fresh AuthUser (role, permissions,
 * branches) into req.user. Loading from DB keeps permission changes effective immediately.
 */
export function authenticate() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Token de acceso requerido');
      }
      const token = header.slice('Bearer '.length).trim();

      let payload: { sub: string };
      try {
        payload = verifyAccessToken(token);
      } catch {
        throw new UnauthorizedError('Token inválido o expirado');
      }

      req.user = await authService.me(payload.sub);
      next();
    } catch (err) {
      next(err);
    }
  };
}
