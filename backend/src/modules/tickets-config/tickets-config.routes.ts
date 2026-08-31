import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { ticketsConfigService, updateTicketsConfigSchema } from './tickets-config.service';

export const ticketsConfigRouter = Router();

ticketsConfigRouter.use(authenticate(), tenant());

// Lectura: operativa (los generadores de ticket la consultan para decidir qué mostrar).
ticketsConfigRouter.get(
  '/tickets-config',
  requirePermission('operations', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await ticketsConfigService.get(req.scope)));
  }),
);

// Escritura: solo administración (configuración).
ticketsConfigRouter.put(
  '/tickets-config',
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateTicketsConfigSchema.parse(req.body);
    res.status(200).json(ok(await ticketsConfigService.update(req.scope, dto)));
  }),
);
