import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { laundryController } from './laundry.controller';

export const laundryRouter = Router();

laundryRouter.use(authenticate(), tenant());

laundryRouter.get('/laundry/pending', requirePermission('operations', 'view'), asyncHandler(laundryController.pending));
laundryRouter.get('/laundry/in-process', requirePermission('operations', 'view'), asyncHandler(laundryController.inProcess));
laundryRouter.get('/laundry/clean', requirePermission('operations', 'view'), asyncHandler(laundryController.clean));
laundryRouter.post('/laundry/send', requirePermission('operations', 'edit'), asyncHandler(laundryController.send));
laundryRouter.post('/laundry/receive', requirePermission('operations', 'edit'), asyncHandler(laundryController.receive));
