import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { servicesController } from './services.controller';

export const servicesRouter = Router();

servicesRouter.use(authenticate(), tenant());

servicesRouter.get('/services/catalog', requirePermission('operations', 'view'), asyncHandler(servicesController.catalog));
servicesRouter.post('/services/charge', requirePermission('operations', 'create'), asyncHandler(servicesController.charge));
servicesRouter.get('/services/supplies', requirePermission('operations', 'view'), asyncHandler(servicesController.supplies));
servicesRouter.post('/services/supplies/:id/deliver', requirePermission('operations', 'edit'), asyncHandler(servicesController.deliver));
servicesRouter.post('/services/supplies/:id/reject', requirePermission('operations', 'edit'), asyncHandler(servicesController.reject));
