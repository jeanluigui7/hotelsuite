import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { inventoryCategoriesController } from './inventory-categories.controller';

export const inventoryCategoriesRouter = Router();

inventoryCategoriesRouter.use(authenticate(), tenant());

inventoryCategoriesRouter.get('/inventory-categories', requirePermission('inventory', 'view'), asyncHandler(inventoryCategoriesController.list));
inventoryCategoriesRouter.get('/inventory-categories/:id', requirePermission('inventory', 'view'), asyncHandler(inventoryCategoriesController.getById));
inventoryCategoriesRouter.post('/inventory-categories', requirePermission('inventory', 'create'), asyncHandler(inventoryCategoriesController.create));
inventoryCategoriesRouter.put('/inventory-categories/:id', requirePermission('inventory', 'edit'), asyncHandler(inventoryCategoriesController.update));
inventoryCategoriesRouter.delete('/inventory-categories/:id', requirePermission('inventory', 'delete'), asyncHandler(inventoryCategoriesController.remove));
