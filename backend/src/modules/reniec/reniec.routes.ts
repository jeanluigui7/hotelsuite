import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requireAnyPermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { reniecService } from './reniec.service';

export const reniecRouter = Router();

reniecRouter.use(authenticate(), tenant());

// La consulta la usa recepción al registrar al huésped (operations) o configuración (settings).
reniecRouter.get(
  '/reniec/dni',
  requireAnyPermission(['operations', 'view'], ['settings', 'view'], ['operations', 'create']),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.scope) throw new UnauthorizedError();
    const numero = typeof req.query.numero === 'string' ? req.query.numero : '';
    if (!numero) throw new ValidationError('Indica el número de DNI.');
    res.status(200).json(ok(await reniecService.lookupDni(numero)));
  }),
);
