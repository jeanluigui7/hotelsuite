import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { salesController } from './sales.controller';

export const salesRouter = Router();

salesRouter.use(authenticate(), tenant());

salesRouter.get('/sales', requirePermission('finance', 'view'), asyncHandler(salesController.list));
salesRouter.get('/sales/:id', requirePermission('finance', 'view'), asyncHandler(salesController.getById));
salesRouter.post('/sales', requirePermission('finance', 'create'), asyncHandler(salesController.create));
salesRouter.post('/sales/:id/cancel', requirePermission('finance', 'edit'), asyncHandler(salesController.cancel));
