import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { whatsappConfigService, whatsappConfigSchema } from './whatsapp-config.service';

export const whatsappConfigRouter = Router();

whatsappConfigRouter.use(authenticate(), tenant());

whatsappConfigRouter.get(
  '/whatsapp/config',
  requirePermission('whatsapp', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappConfigService.get(req.scope)));
  }),
);

whatsappConfigRouter.put(
  '/whatsapp/config',
  requirePermission('whatsapp', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = whatsappConfigSchema.parse(req.body);
    res.status(200).json(ok(await whatsappConfigService.update(req.scope, dto)));
  }),
);
