import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { linenAdminController } from './linen-admin.controller';

export const linenAdminRouter = Router();

linenAdminRouter.use(authenticate(), tenant());

linenAdminRouter.get('/admin/linen/requests', requirePermission('inventory', 'view'), asyncHandler(linenAdminController.requests));
linenAdminRouter.get('/admin/linen/central', requirePermission('inventory', 'view'), asyncHandler(linenAdminController.central));
linenAdminRouter.post('/admin/linen/requests/:id/fulfill', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.fulfill));
linenAdminRouter.post('/admin/linen/requests/:id/reject', requireAnyPermission(['operations', 'edit'], ['inventory', 'edit']), asyncHandler(linenAdminController.reject));
linenAdminRouter.post('/admin/linen/transfer', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.transfer));
linenAdminRouter.post('/admin/linen/replenish', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.replenish));
