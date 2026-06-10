import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { performanceController } from './performance.controller';

export const performanceRouter = Router();

performanceRouter.use(authenticate(), tenant());

performanceRouter.get('/performance', requirePermission('reports', 'view'), asyncHandler(performanceController.report));
