import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { suppliersController } from './suppliers.controller';

export const suppliersRouter = Router();

suppliersRouter.use(authenticate(), tenant());

suppliersRouter.get('/suppliers', requirePermission('logistics', 'view'), asyncHandler(suppliersController.list));
suppliersRouter.get('/suppliers/:id', requirePermission('logistics', 'view'), asyncHandler(suppliersController.getById));
suppliersRouter.post('/suppliers', requirePermission('logistics', 'create'), asyncHandler(suppliersController.create));
suppliersRouter.put('/suppliers/:id', requirePermission('logistics', 'edit'), asyncHandler(suppliersController.update));
suppliersRouter.delete('/suppliers/:id', requirePermission('logistics', 'delete'), asyncHandler(suppliersController.remove));
