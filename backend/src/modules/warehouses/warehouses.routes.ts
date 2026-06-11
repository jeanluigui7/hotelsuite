import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { warehousesController } from './warehouses.controller';

export const warehousesRouter = Router();

warehousesRouter.use(authenticate(), tenant());

warehousesRouter.get('/warehouses', requirePermission('inventory', 'view'), asyncHandler(warehousesController.list));
warehousesRouter.get('/warehouses/:id', requirePermission('inventory', 'view'), asyncHandler(warehousesController.getById));
warehousesRouter.get('/warehouses/:id/stock', requirePermission('inventory', 'view'), asyncHandler(warehousesController.stock));
warehousesRouter.post('/warehouses', requirePermission('inventory', 'create'), asyncHandler(warehousesController.create));
warehousesRouter.put('/warehouses/:id', requirePermission('inventory', 'edit'), asyncHandler(warehousesController.update));
warehousesRouter.delete('/warehouses/:id', requirePermission('inventory', 'delete'), asyncHandler(warehousesController.remove));
