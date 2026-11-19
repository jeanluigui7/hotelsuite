import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { reservationsConfigService, reservasConfigSchema } from './reservations-config.service';

export const reservationsConfigRouter = Router();

reservationsConfigRouter.use(authenticate(), tenant());

// Lectura: cualquier usuario operativo (recepción la consulta para sembrar defaults al reservar).
reservationsConfigRouter.get(
  '/reservations-config',
  requirePermission('operations', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reservationsConfigService.get(req.scope)));
  }),
);

// Escritura: solo administración (configuración).
reservationsConfigRouter.put(
  '/reservations-config',
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = reservasConfigSchema.parse(req.body);
    res.status(200).json(ok(await reservationsConfigService.update(req.scope, dto)));
  }),
);
