import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requireAnyPermission } from '../../middlewares/rbac.middleware';
import { roomInventoryController } from './room-inventory.controller';

export const roomInventoryRouter = Router();

roomInventoryRouter.use(authenticate(), tenant());

roomInventoryRouter.get('/rooms/:id/inventory', requireAnyPermission(['operations', 'view'], ['inventory', 'view']), asyncHandler(roomInventoryController.get));
roomInventoryRouter.post('/rooms/:id/inventory/initial', requireAnyPermission(['operations', 'edit'], ['inventory', 'edit']), asyncHandler(roomInventoryController.saveInitial));
roomInventoryRouter.post('/rooms/:id/inventory/load-base', requireAnyPermission(['operations', 'edit'], ['inventory', 'edit']), asyncHandler(roomInventoryController.loadBase));
