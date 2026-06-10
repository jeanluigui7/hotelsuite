import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { purchasesController } from './purchases.controller';

export const purchasesRouter = Router();

purchasesRouter.use(authenticate(), tenant());

purchasesRouter.get('/purchases', requirePermission('logistics', 'view'), asyncHandler(purchasesController.list));
purchasesRouter.get('/purchases/:id', requirePermission('logistics', 'view'), asyncHandler(purchasesController.getById));
purchasesRouter.post('/purchases', requirePermission('logistics', 'create'), asyncHandler(purchasesController.create));
