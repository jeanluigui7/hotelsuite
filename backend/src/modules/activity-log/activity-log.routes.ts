import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { activityLogController } from './activity-log.controller';

export const activityLogRouter = Router();

activityLogRouter.use(authenticate(), tenant());

activityLogRouter.get('/activity-logs', requirePermission('hr', 'view'), asyncHandler(activityLogController.list));
