import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { subWarehousesController } from './subwarehouses.controller';

export const subWarehousesRouter = Router();

subWarehousesRouter.use(authenticate(), tenant());

subWarehousesRouter.get('/subwarehouses', requireAnyPermission(['inventory', 'view'], ['operations', 'view']), asyncHandler(subWarehousesController.list));
subWarehousesRouter.get('/subwarehouses/coverage-rooms', requireAnyPermission(['inventory', 'view'], ['operations', 'view']), asyncHandler(subWarehousesController.coverageRooms));
subWarehousesRouter.post('/subwarehouses', requirePermission('inventory', 'create'), asyncHandler(subWarehousesController.create));
subWarehousesRouter.put('/subwarehouses/:id', requirePermission('inventory', 'edit'), asyncHandler(subWarehousesController.update));
subWarehousesRouter.put('/subwarehouses/:id/rooms', requirePermission('inventory', 'edit'), asyncHandler(subWarehousesController.setRooms));
subWarehousesRouter.delete('/subwarehouses/:id', requirePermission('inventory', 'delete'), asyncHandler(subWarehousesController.remove));
