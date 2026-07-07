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
// Crear/eliminar tipos de habitación usa permisos dedicados (el Gerente no los tiene);
// editar/ver se mantiene en 'settings'.
roomTypesRouter.post('/room-types', requirePermission('roomtypes', 'create'), asyncHandler(roomTypesController.create));
roomTypesRouter.put('/room-types/:id', requirePermission('settings', 'edit'), asyncHandler(roomTypesController.update));
roomTypesRouter.delete('/room-types/:id', requirePermission('roomtypes', 'delete'), asyncHandler(roomTypesController.remove));
