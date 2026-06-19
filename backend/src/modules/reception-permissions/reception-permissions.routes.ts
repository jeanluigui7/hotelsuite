import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { receptionPermsService, updateReceptionPermsSchema } from './reception-permissions.service';

export const receptionPermsRouter = Router();

receptionPermsRouter.use(authenticate(), tenant());

// Lectura: cualquier usuario con operaciones (recepción lo consulta para habilitar funciones).
receptionPermsRouter.get(
  '/reception/permissions',
  requirePermission('operations', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await receptionPermsService.get(req.scope)));
  }),
);
// Escritura: solo configuración (admin).
receptionPermsRouter.put(
  '/reception/permissions',
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateReceptionPermsSchema.parse(req.body);
    res.status(200).json(ok(await receptionPermsService.update(req.scope, dto)));
  }),
);
