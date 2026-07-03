import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { movementsController } from './movements.controller';

export const movementsRouter = Router();

movementsRouter.use(authenticate(), tenant());

movementsRouter.get('/movements', requirePermission('inventory', 'view'), asyncHandler(movementsController.list));
movementsRouter.post('/movements/adjust', requirePermission('inventory', 'edit'), asyncHandler(movementsController.adjust));
movementsRouter.post('/movements/transfer', requirePermission('inventory', 'edit'), asyncHandler(movementsController.transfer));
movementsRouter.post('/movements/transfer-area', requirePermission('inventory', 'edit'), asyncHandler(movementsController.transferArea));
