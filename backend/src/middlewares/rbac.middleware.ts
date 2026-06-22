import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';
import { permissionKey, type AppAction, type AppModule } from '../shared/rbac';

/**
 * Guards a route by required permission (module × action).
 * Super Admin bypasses all checks. Must run after authenticate().
 */
export function requirePermission(module: AppModule, action: AppAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }
    if (user.isSuperAdmin || user.permissions.includes(permissionKey(module, action))) {
      next();
      return;
    }
    next(new ForbiddenError(`Permiso requerido: ${permissionKey(module, action)}`));
  };
}

/**
 * Permite el acceso si el usuario tiene CUALQUIERA de los permisos indicados.
 * Útil para catálogos de lectura usados por varios módulos (ej. tarifas/tiers en el
 * check-in de operaciones, además de su pantalla de configuración).
 */
export function requireAnyPermission(...perms: Array<[AppModule, AppAction]>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }
    if (user.isSuperAdmin || perms.some(([m, a]) => user.permissions.includes(permissionKey(m, a)))) {
      next();
      return;
    }
    next(new ForbiddenError(`Permiso requerido: ${perms.map(([m, a]) => permissionKey(m, a)).join(' o ')}`));
  };
}
