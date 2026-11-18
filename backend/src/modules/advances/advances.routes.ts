import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { advancesController } from './advances.controller';

export const advancesRouter = Router();

advancesRouter.use(authenticate(), tenant());

advancesRouter.get('/advances', requirePermission('operations', 'view'), asyncHandler(advancesController.list));
advancesRouter.post('/advances', requirePermission('operations', 'create'), asyncHandler(advancesController.create));
advancesRouter.post('/advances/:id/apply', requirePermission('operations', 'edit'), asyncHandler(advancesController.apply));
