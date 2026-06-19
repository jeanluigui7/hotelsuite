import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { staysController } from './stays.controller';

export const staysRouter = Router();

staysRouter.use(authenticate(), tenant());

staysRouter.get('/stays', requirePermission('operations', 'view'), asyncHandler(staysController.list));
staysRouter.get('/stays/:id', requirePermission('operations', 'view'), asyncHandler(staysController.getById));
staysRouter.get('/stays/:id/checkout-summary', requirePermission('operations', 'view'), asyncHandler(staysController.checkoutSummary));
staysRouter.post('/stays/check-in', requirePermission('operations', 'create'), asyncHandler(staysController.checkIn));
staysRouter.post('/stays/:id/check-out', requirePermission('operations', 'edit'), asyncHandler(staysController.checkOut));
