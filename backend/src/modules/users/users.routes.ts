import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { usersController } from './users.controller';

export const usersRouter = Router();

usersRouter.use(authenticate(), tenant());

// Users are managed under the HR module.
usersRouter.get('/users', requirePermission('hr', 'view'), asyncHandler(usersController.list));
usersRouter.get('/users/:id', requirePermission('hr', 'view'), asyncHandler(usersController.getById));
usersRouter.post('/users', requirePermission('hr', 'create'), asyncHandler(usersController.create));
usersRouter.put('/users/:id', requirePermission('hr', 'edit'), asyncHandler(usersController.update));
usersRouter.post('/users/:id/reset-password', requirePermission('hr', 'edit'), asyncHandler(usersController.resetPassword));
// Ver contraseña en claro: SOLO el cargo máximo (se valida isSuperAdmin dentro del servicio).
usersRouter.get('/users/:id/password', requirePermission('hr', 'view'), asyncHandler(usersController.viewPassword));
usersRouter.delete('/users/:id', requirePermission('hr', 'delete'), asyncHandler(usersController.remove));
