import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { roomsController } from './rooms.controller';

export const roomsRouter = Router();

roomsRouter.use(authenticate(), tenant());

roomsRouter.get('/rooms/map', requirePermission('operations', 'view'), asyncHandler(roomsController.map));
roomsRouter.get('/rooms', requirePermission('operations', 'view'), asyncHandler(roomsController.list));
roomsRouter.get('/rooms/:id', requirePermission('operations', 'view'), asyncHandler(roomsController.getById));
// Crear/eliminar habitaciones usa permisos dedicados (el Gerente no los tiene).
roomsRouter.post('/rooms', requirePermission('rooms', 'create'), asyncHandler(roomsController.create));
roomsRouter.put('/rooms/:id', requirePermission('operations', 'edit'), asyncHandler(roomsController.update));
roomsRouter.patch('/rooms/:id/status', requirePermission('operations', 'edit'), asyncHandler(roomsController.changeStatus));
roomsRouter.delete('/rooms/:id', requirePermission('rooms', 'delete'), asyncHandler(roomsController.remove));
