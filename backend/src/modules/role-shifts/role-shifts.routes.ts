import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { roleShiftsController } from './role-shifts.controller';

export const roleShiftsRouter = Router();

roleShiftsRouter.use(authenticate(), tenant());

roleShiftsRouter.get('/role-shifts', requirePermission('settings', 'view'), asyncHandler(roleShiftsController.list));
roleShiftsRouter.put('/role-shifts', requirePermission('settings', 'edit'), asyncHandler(roleShiftsController.save));
