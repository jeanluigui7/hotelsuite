import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { reservationsController } from './reservations.controller';

export const reservationsRouter = Router();

reservationsRouter.use(authenticate(), tenant());

reservationsRouter.get('/reservations', requirePermission('operations', 'view'), asyncHandler(reservationsController.list));
reservationsRouter.get('/reservations/availability', requirePermission('operations', 'view'), asyncHandler(reservationsController.availability));
reservationsRouter.get('/reservations/:id', requirePermission('operations', 'view'), asyncHandler(reservationsController.getById));
reservationsRouter.get('/reservations/:id/documents/:docId', requirePermission('operations', 'view'), asyncHandler(reservationsController.getDocument));
reservationsRouter.post('/reservations', requirePermission('operations', 'create'), asyncHandler(reservationsController.create));
reservationsRouter.put('/reservations/:id', requirePermission('operations', 'edit'), asyncHandler(reservationsController.update));
reservationsRouter.post('/reservations/:id/status', requirePermission('operations', 'edit'), asyncHandler(reservationsController.changeStatus));
reservationsRouter.post('/reservations/:id/payments', requirePermission('operations', 'edit'), asyncHandler(reservationsController.addPayment));
reservationsRouter.post('/reservations/:id/cancel', requirePermission('operations', 'edit'), asyncHandler(reservationsController.cancel));
reservationsRouter.delete('/reservations/:id', requirePermission('operations', 'delete'), asyncHandler(reservationsController.remove));
