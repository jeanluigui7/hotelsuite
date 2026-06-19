import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { cleaningController } from './cleaning.controller';

export const cleaningRouter = Router();

cleaningRouter.use(authenticate(), tenant());

cleaningRouter.get('/cleaning/linen-items', requirePermission('operations', 'view'), asyncHandler(cleaningController.linenItems));
cleaningRouter.get('/cleaning/rooms', requirePermission('operations', 'view'), asyncHandler(cleaningController.roomsToClean));
cleaningRouter.post('/cleaning/:roomId/start', requirePermission('operations', 'edit'), asyncHandler(cleaningController.start));
cleaningRouter.post('/cleaning/:roomId/finish', requirePermission('operations', 'edit'), asyncHandler(cleaningController.finish));
