import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { reservationsController } from './reservations.controller';

export const reservationsRouter = Router();

reservationsRouter.use(authenticate(), tenant());

reservationsRouter.get('/reservations', requirePermission('operations', 'view'), asyncHandler(reservationsController.list));
reservationsRouter.get('/reservations/:id', requirePermission('operations', 'view'), asyncHandler(reservationsController.getById));
reservationsRouter.post('/reservations', requirePermission('operations', 'create'), asyncHandler(reservationsController.create));
reservationsRouter.put('/reservations/:id', requirePermission('operations', 'edit'), asyncHandler(reservationsController.update));
reservationsRouter.delete('/reservations/:id', requirePermission('operations', 'delete'), asyncHandler(reservationsController.remove));
