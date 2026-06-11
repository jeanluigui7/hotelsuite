import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { logisticsController } from './logistics.controller';

export const logisticsRouter = Router();

logisticsRouter.use(authenticate(), tenant());

logisticsRouter.get('/logistics/valuation', requirePermission('logistics', 'view'), asyncHandler(logisticsController.valuation));
logisticsRouter.get('/logistics/reorder', requirePermission('logistics', 'view'), asyncHandler(logisticsController.reorder));
logisticsRouter.get('/logistics/kardex', requirePermission('logistics', 'view'), asyncHandler(logisticsController.kardex));
logisticsRouter.get('/logistics/profit', requirePermission('logistics', 'view'), asyncHandler(logisticsController.profit));
