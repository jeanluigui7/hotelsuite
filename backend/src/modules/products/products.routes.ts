import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { productsController } from './products.controller';

export const productsRouter = Router();

productsRouter.use(authenticate(), tenant());

productsRouter.get('/products', requirePermission('inventory', 'view'), asyncHandler(productsController.list));
productsRouter.get('/products/:id', requirePermission('inventory', 'view'), asyncHandler(productsController.getById));
productsRouter.post('/products', requirePermission('inventory', 'create'), asyncHandler(productsController.create));
productsRouter.put('/products/:id', requirePermission('inventory', 'edit'), asyncHandler(productsController.update));
productsRouter.delete('/products/:id', requirePermission('inventory', 'delete'), asyncHandler(productsController.remove));
