import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { clientTiersController } from './client-tiers.controller';

export const clientTiersRouter = Router();

clientTiersRouter.use(authenticate(), tenant());

// La lectura de tiers la usan settings (configuración) y operations (check-in).
clientTiersRouter.get('/client-tiers', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(clientTiersController.list));
clientTiersRouter.get('/client-tiers/:id', requirePermission('settings', 'view'), asyncHandler(clientTiersController.getById));
clientTiersRouter.post('/client-tiers', requirePermission('settings', 'create'), asyncHandler(clientTiersController.create));
clientTiersRouter.put('/client-tiers/:id', requirePermission('settings', 'edit'), asyncHandler(clientTiersController.update));
clientTiersRouter.delete('/client-tiers/:id', requirePermission('settings', 'delete'), asyncHandler(clientTiersController.remove));
