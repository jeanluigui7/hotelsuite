import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { landingController } from './landing.controller';

export const landingRouter = Router();

landingRouter.use(authenticate(), tenant());

landingRouter.get('/landing/config', requirePermission('settings', 'view'), asyncHandler(landingController.get));
landingRouter.put('/landing/config', requirePermission('settings', 'edit'), asyncHandler(landingController.update));
