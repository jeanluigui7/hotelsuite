import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { dotacionController } from './dotacion.controller';

export const dotacionRouter = Router();

dotacionRouter.use(authenticate(), tenant());

// La dotación BASE la configura el admin (settings) y la consulta también limpieza (operations).
dotacionRouter.get('/dotacion', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(dotacionController.list));
dotacionRouter.post('/dotacion', requirePermission('settings', 'create'), asyncHandler(dotacionController.create));
dotacionRouter.put('/dotacion/:id', requirePermission('settings', 'edit'), asyncHandler(dotacionController.update));
dotacionRouter.delete('/dotacion/:id', requirePermission('settings', 'delete'), asyncHandler(dotacionController.remove));
