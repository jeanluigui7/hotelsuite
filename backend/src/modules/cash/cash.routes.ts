import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { cashController } from './cash.controller';

export const cashRouter = Router();

cashRouter.use(authenticate(), tenant());

cashRouter.get('/cash/current', requirePermission('finance', 'view'), asyncHandler(cashController.current));
cashRouter.post('/cash/open', requirePermission('finance', 'create'), asyncHandler(cashController.open));
cashRouter.post('/cash/close', requirePermission('finance', 'edit'), asyncHandler(cashController.close));
