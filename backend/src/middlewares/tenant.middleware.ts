import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';
import type { RequestScope } from '../shared/context';

/**
 * Builds req.scope from the authenticated user.
 * - The active branch comes from ?branchId (validated against membership) or the first branch.
 * - Super Admin may operate any branch (?branchId is honored without membership check).
 * Must run after authenticate().
 */
export function tenant() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = req.user;
      if (!user) throw new UnauthorizedError();

      const requested = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;

      let activeBranchId: string | null = null;
      if (requested) {
        if (!user.isSuperAdmin && !user.branchIds.includes(requested)) {
          throw new ForbiddenError('No tiene acceso a la sucursal seleccionada');
        }
        activeBranchId = requested;
      } else {
        activeBranchId = user.branchIds[0] ?? null;
      }

      const scope: RequestScope = {
        userId: user.userId,
        roleId: user.roleId,
        isSuperAdmin: user.isSuperAdmin,
        branchIds: user.branchIds,
        activeBranchId,
      };
      req.scope = scope;
      next();
    } catch (err) {
      next(err);
    }
  };
}
