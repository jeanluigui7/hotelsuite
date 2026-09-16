import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { linenRegularizationController } from './linen-regularization.controller';

export const linenRegularizationRouter = Router();

linenRegularizationRouter.use(authenticate(), tenant());

// Housekeeping (Inventario Limpieza)
linenRegularizationRouter.get('/cleaning/linen/regularization/blocked', requirePermission('operations', 'view'), asyncHandler(linenRegularizationController.blocked));
linenRegularizationRouter.get('/cleaning/linen/regularization/items', requirePermission('operations', 'view'), asyncHandler(linenRegularizationController.items));
linenRegularizationRouter.post('/cleaning/linen/regularization', requirePermission('operations', 'create'), asyncHandler(linenRegularizationController.create));

// Administración (Almacén de Ropa) — el servicio revalida además que sea admin (assertCanReview).
linenRegularizationRouter.get('/admin/linen/regularizations', requireAnyPermission(['inventory', 'view'], ['operations', 'view']), asyncHandler(linenRegularizationController.list));
linenRegularizationRouter.get('/admin/linen/regularizations/pending-count', requireAnyPermission(['inventory', 'view'], ['operations', 'view']), asyncHandler(linenRegularizationController.pendingCount));
linenRegularizationRouter.post('/admin/linen/regularizations/:id/approve', requireAnyPermission(['inventory', 'edit'], ['operations', 'edit']), asyncHandler(linenRegularizationController.approve));
linenRegularizationRouter.post('/admin/linen/regularizations/:id/reject', requireAnyPermission(['inventory', 'edit'], ['operations', 'edit']), asyncHandler(linenRegularizationController.reject));
