import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { areasController } from './areas.controller';

export const areasRouter = Router();

areasRouter.use(authenticate(), tenant());

areasRouter.get('/areas', requirePermission('inventory', 'view'), asyncHandler(areasController.list));
areasRouter.get('/areas/:id', requirePermission('inventory', 'view'), asyncHandler(areasController.getById));
areasRouter.post('/areas', requirePermission('inventory', 'create'), asyncHandler(areasController.create));
areasRouter.put('/areas/:id', requirePermission('inventory', 'edit'), asyncHandler(areasController.update));
areasRouter.delete('/areas/:id', requirePermission('inventory', 'delete'), asyncHandler(areasController.remove));
