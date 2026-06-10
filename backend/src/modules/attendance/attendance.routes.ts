import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { attendanceController } from './attendance.controller';

export const attendanceRouter = Router();

attendanceRouter.use(authenticate(), tenant());

attendanceRouter.get('/attendances', requirePermission('hr', 'view'), asyncHandler(attendanceController.list));
attendanceRouter.post('/attendances', requirePermission('hr', 'create'), asyncHandler(attendanceController.create));
