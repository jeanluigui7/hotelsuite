import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { roomTypesController } from './room-types.controller';

export const roomTypesRouter = Router();

roomTypesRouter.use(authenticate(), tenant());

roomTypesRouter.get('/room-types', requirePermission('settings', 'view'), asyncHandler(roomTypesController.list));
roomTypesRouter.get('/room-types/:id', requirePermission('settings', 'view'), asyncHandler(roomTypesController.getById));
roomTypesRouter.post('/room-types', requirePermission('settings', 'create'), asyncHandler(roomTypesController.create));
roomTypesRouter.put('/room-types/:id', requirePermission('settings', 'edit'), asyncHandler(roomTypesController.update));
roomTypesRouter.delete('/room-types/:id', requirePermission('settings', 'delete'), asyncHandler(roomTypesController.remove));
