import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { itemsController } from './items.controller';

export const itemsRouter = Router();

itemsRouter.use(authenticate(), tenant());

itemsRouter.get('/items', requirePermission('settings', 'view'), asyncHandler(itemsController.list));
itemsRouter.get('/items/:id', requirePermission('settings', 'view'), asyncHandler(itemsController.getById));
itemsRouter.post('/items', requirePermission('settings', 'create'), asyncHandler(itemsController.create));
itemsRouter.put('/items/:id', requirePermission('settings', 'edit'), asyncHandler(itemsController.update));
itemsRouter.delete('/items/:id', requirePermission('settings', 'delete'), asyncHandler(itemsController.remove));
