import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { customRateBlockController } from './custom-rate-block.controller';

export const customRateBlockRouter = Router();

customRateBlockRouter.use(authenticate(), tenant());

// Ver la config la puede leer Recepción (para saber si está bloqueada); editar solo Admin (validado en el service).
customRateBlockRouter.get('/custom-rate-block', requirePermission('operations', 'view'), asyncHandler(customRateBlockController.get));
customRateBlockRouter.put('/custom-rate-block', requirePermission('settings', 'edit'), asyncHandler(customRateBlockController.update));
