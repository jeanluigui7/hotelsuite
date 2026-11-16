import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { maintenanceController } from './maintenance.controller';

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate(), tenant());

maintenanceRouter.get('/maintenances', requirePermission('operations', 'view'), asyncHandler(maintenanceController.list));
maintenanceRouter.post('/maintenances/report-fault', requirePermission('operations', 'create'), asyncHandler(maintenanceController.reportFaults));
maintenanceRouter.get('/maintenances/:id', requirePermission('operations', 'view'), asyncHandler(maintenanceController.get));
maintenanceRouter.post('/maintenances', requirePermission('operations', 'create'), asyncHandler(maintenanceController.create));
// Resolver falla: SOLO Admin + personal de Mantenimiento (maintenance:approve).
maintenanceRouter.post('/maintenances/:id/resolve', requirePermission('maintenance', 'approve'), asyncHandler(maintenanceController.resolve));
maintenanceRouter.put('/maintenances/:id', requirePermission('operations', 'edit'), asyncHandler(maintenanceController.update));
maintenanceRouter.delete('/maintenances/:id', requirePermission('operations', 'delete'), asyncHandler(maintenanceController.remove));
