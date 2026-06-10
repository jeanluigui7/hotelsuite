import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { housekeepingController } from './housekeeping.controller';

export const housekeepingRouter = Router();

housekeepingRouter.use(authenticate(), tenant());

housekeepingRouter.get('/housekeeping-tasks', requirePermission('operations', 'view'), asyncHandler(housekeepingController.list));
housekeepingRouter.post('/housekeeping-tasks', requirePermission('operations', 'create'), asyncHandler(housekeepingController.create));
housekeepingRouter.post('/housekeeping-tasks/:id/start', requirePermission('operations', 'edit'), asyncHandler(housekeepingController.start));
housekeepingRouter.post('/housekeeping-tasks/:id/complete', requirePermission('operations', 'edit'), asyncHandler(housekeepingController.complete));
housekeepingRouter.post('/housekeeping-tasks/:id/inspect', requirePermission('operations', 'approve'), asyncHandler(housekeepingController.inspect));
