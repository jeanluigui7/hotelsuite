import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { rolesController } from './roles.controller';

export const rolesRouter = Router();

rolesRouter.use(authenticate(), tenant());

// Roles & permissions are managed under "Autenticación por Roles" (settings module).
rolesRouter.get('/permissions', requirePermission('settings', 'view'), asyncHandler(rolesController.permissions));
rolesRouter.get('/roles', requirePermission('settings', 'view'), asyncHandler(rolesController.list));
rolesRouter.get('/roles/:id', requirePermission('settings', 'view'), asyncHandler(rolesController.getById));
rolesRouter.post('/roles', requirePermission('settings', 'create'), asyncHandler(rolesController.create));
rolesRouter.put('/roles/:id', requirePermission('settings', 'edit'), asyncHandler(rolesController.update));
rolesRouter.delete('/roles/:id', requirePermission('settings', 'delete'), asyncHandler(rolesController.remove));
