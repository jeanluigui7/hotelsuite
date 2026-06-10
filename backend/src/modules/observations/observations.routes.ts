import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { observationsController } from './observations.controller';

export const observationsRouter = Router();

observationsRouter.use(authenticate(), tenant());

observationsRouter.get('/observations', requirePermission('operations', 'view'), asyncHandler(observationsController.list));
observationsRouter.post('/observations', requirePermission('operations', 'create'), asyncHandler(observationsController.create));
observationsRouter.put('/observations/:id', requirePermission('operations', 'edit'), asyncHandler(observationsController.update));
observationsRouter.delete('/observations/:id', requirePermission('operations', 'delete'), asyncHandler(observationsController.remove));
