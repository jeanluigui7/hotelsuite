import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { workShiftsController } from './work-shifts.controller';

export const workShiftsRouter = Router();

workShiftsRouter.use(authenticate(), tenant());

// Gestión de Turno (operación de recepción).
workShiftsRouter.get('/work-shifts/current', requirePermission('operations', 'view'), asyncHandler(workShiftsController.current));
workShiftsRouter.post('/work-shifts/start', requirePermission('operations', 'view'), asyncHandler(workShiftsController.start));
workShiftsRouter.post('/work-shifts/end', requirePermission('operations', 'view'), asyncHandler(workShiftsController.end));
