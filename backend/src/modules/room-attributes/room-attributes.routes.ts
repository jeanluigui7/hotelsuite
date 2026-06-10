import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { roomAttributesController } from './room-attributes.controller';

export const roomAttributesRouter = Router();

roomAttributesRouter.use(authenticate(), tenant());

roomAttributesRouter.get('/room-attributes', requirePermission('settings', 'view'), asyncHandler(roomAttributesController.list));
roomAttributesRouter.get('/room-attributes/:id', requirePermission('settings', 'view'), asyncHandler(roomAttributesController.getById));
roomAttributesRouter.post('/room-attributes', requirePermission('settings', 'create'), asyncHandler(roomAttributesController.create));
roomAttributesRouter.put('/room-attributes/:id', requirePermission('settings', 'edit'), asyncHandler(roomAttributesController.update));
roomAttributesRouter.delete('/room-attributes/:id', requirePermission('settings', 'delete'), asyncHandler(roomAttributesController.remove));
