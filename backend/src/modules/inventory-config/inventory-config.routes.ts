import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { inventoryConfigController } from './inventory-config.controller';

export const inventoryConfigRouter = Router();

inventoryConfigRouter.use(authenticate(), tenant());

inventoryConfigRouter.get('/inventory/config', requirePermission('inventory', 'view'), asyncHandler(inventoryConfigController.get));
inventoryConfigRouter.put('/inventory/config', requirePermission('inventory', 'edit'), asyncHandler(inventoryConfigController.update));
