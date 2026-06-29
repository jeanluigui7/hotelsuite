import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { roomCleaningController } from './room-cleaning.controller';

export const roomCleaningRouter = Router();

roomCleaningRouter.use(authenticate(), tenant());

roomCleaningRouter.post('/rooms/:id/cleaning/retiro', requirePermission('operations', 'edit'), asyncHandler(roomCleaningController.retiro));
roomCleaningRouter.post('/rooms/:id/cleaning/reposicion', requirePermission('operations', 'edit'), asyncHandler(roomCleaningController.reposicion));
roomCleaningRouter.post('/rooms/:id/cleaning/finalizar', requirePermission('operations', 'edit'), asyncHandler(roomCleaningController.finalizar));
