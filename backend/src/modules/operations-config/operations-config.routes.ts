import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { operationsConfigService, updateOperationsConfigSchema } from './operations-config.service';

export const operationsConfigRouter = Router();

operationsConfigRouter.use(authenticate(), tenant());

// Lectura: cualquier usuario operativo (recepción/limpieza la consultan para habilitar funciones).
operationsConfigRouter.get(
  '/operations-config',
  requirePermission('operations', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await operationsConfigService.get(req.scope)));
  }),
);

// Escritura: solo administración (configuración).
operationsConfigRouter.put(
  '/operations-config',
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateOperationsConfigSchema.parse(req.body);
    res.status(200).json(ok(await operationsConfigService.update(req.scope, dto)));
  }),
);
