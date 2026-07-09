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
linenAdminRouter.get('/admin/linen/warehouse', requireAnyPermission(['inventory', 'view'], ['operations', 'view']), asyncHandler(linenAdminController.warehouse));
linenAdminRouter.post('/admin/linen/requests/:id/fulfill', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.fulfill));
linenAdminRouter.post('/admin/linen/requests/:id/reject', requireAnyPermission(['operations', 'edit'], ['inventory', 'edit']), asyncHandler(linenAdminController.reject));
linenAdminRouter.post('/admin/linen/transfer', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.transfer));
linenAdminRouter.post('/admin/linen/transfer-bulk', requireAnyPermission(['inventory', 'edit'], ['operations', 'edit']), asyncHandler(linenAdminController.transferBulk));
linenAdminRouter.post('/admin/linen/replenish', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.replenish));
linenAdminRouter.post('/admin/linen/close-shift', requireAnyPermission(['operations', 'edit'], ['inventory', 'edit']), asyncHandler(linenAdminController.closeShift));
linenAdminRouter.post('/admin/linen/items', requirePermission('inventory', 'create'), asyncHandler(linenAdminController.createItem));
linenAdminRouter.put('/admin/linen/items/:id', requirePermission('inventory', 'edit'), asyncHandler(linenAdminController.updateItem));
linenAdminRouter.delete('/admin/linen/items/:id', requirePermission('inventory', 'delete'), asyncHandler(linenAdminController.deactivateItem));
