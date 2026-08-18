import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { wifiConfigService, wifiConfigSchema } from './wifi-config.service';

export const wifiConfigRouter = Router();

wifiConfigRouter.use(authenticate(), tenant());

// Lectura: administración (settings) o WhatsApp (para mostrar el modo que consume el mensaje).
wifiConfigRouter.get(
  '/wifi/config',
  requireAnyPermission(['settings', 'view'], ['whatsapp', 'view']),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await wifiConfigService.get(req.scope)));
  }),
);

// Escritura: administración.
wifiConfigRouter.put(
  '/wifi/config',
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = wifiConfigSchema.parse(req.body);
    res.status(200).json(ok(await wifiConfigService.update(req.scope, dto)));
  }),
);
