import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { shiftLogsController } from './shift-logs.controller';

export const shiftLogsRouter = Router();

shiftLogsRouter.use(authenticate(), tenant());

shiftLogsRouter.get('/shift-logs', requirePermission('operations', 'view'), asyncHandler(shiftLogsController.list));
shiftLogsRouter.get('/shift-logs/:id', requirePermission('operations', 'view'), asyncHandler(shiftLogsController.get));
shiftLogsRouter.post('/shift-logs/close', requirePermission('operations', 'edit'), asyncHandler(shiftLogsController.close));
