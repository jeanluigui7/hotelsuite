import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { laundryTasksController } from './laundry-tasks.controller';

export const laundryTasksRouter = Router();

laundryTasksRouter.use(authenticate(), tenant());

laundryTasksRouter.get('/laundry-tasks', requirePermission('reports', 'view'), asyncHandler(laundryTasksController.list));
laundryTasksRouter.post('/laundry-tasks', requirePermission('reports', 'create'), asyncHandler(laundryTasksController.create));
laundryTasksRouter.put('/laundry-tasks/:id', requirePermission('reports', 'edit'), asyncHandler(laundryTasksController.update));
laundryTasksRouter.delete('/laundry-tasks/:id', requirePermission('reports', 'delete'), asyncHandler(laundryTasksController.remove));
