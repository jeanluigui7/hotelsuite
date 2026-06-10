import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { schedulesController } from './schedules.controller';

export const schedulesRouter = Router();

schedulesRouter.use(authenticate(), tenant());

schedulesRouter.get('/schedules', requirePermission('settings', 'view'), asyncHandler(schedulesController.list));
schedulesRouter.get('/schedules/:id', requirePermission('settings', 'view'), asyncHandler(schedulesController.getById));
schedulesRouter.post('/schedules', requirePermission('settings', 'create'), asyncHandler(schedulesController.create));
schedulesRouter.put('/schedules/:id', requirePermission('settings', 'edit'), asyncHandler(schedulesController.update));
schedulesRouter.delete('/schedules/:id', requirePermission('settings', 'delete'), asyncHandler(schedulesController.remove));
