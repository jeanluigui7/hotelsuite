import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { conciergeController } from './concierge.controller';

export const conciergeRouter = Router();

conciergeRouter.use(authenticate(), tenant());

conciergeRouter.get('/concierge-requests', requirePermission('operations', 'view'), asyncHandler(conciergeController.list));
conciergeRouter.post('/concierge-requests', requirePermission('operations', 'create'), asyncHandler(conciergeController.create));
conciergeRouter.put('/concierge-requests/:id', requirePermission('operations', 'edit'), asyncHandler(conciergeController.update));
conciergeRouter.delete('/concierge-requests/:id', requirePermission('operations', 'delete'), asyncHandler(conciergeController.remove));
