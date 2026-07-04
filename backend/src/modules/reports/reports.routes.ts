import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { reportsController } from './reports.controller';

export const reportsRouter = Router();

reportsRouter.use(authenticate(), tenant());

reportsRouter.get('/reports/rooms', requirePermission('reports', 'view'), asyncHandler(reportsController.rooms));
reportsRouter.get('/reports/housekeeping', requirePermission('reports', 'view'), asyncHandler(reportsController.housekeeping));
reportsRouter.get('/reports/sales-detailed', requirePermission('reports', 'view'), asyncHandler(reportsController.salesDetailed));
reportsRouter.get('/reports/product-limit', requirePermission('reports', 'view'), asyncHandler(reportsController.productLimit));
// Historial de movimientos de productos/servicios (recepción) — bajo operaciones.
reportsRouter.get('/reports/movements', requirePermission('operations', 'view'), asyncHandler(reportsController.movements));
reportsRouter.get('/reports/inspections', requirePermission('reports', 'view'), asyncHandler(reportsController.inspections));
