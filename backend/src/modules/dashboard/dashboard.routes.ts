import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { dashboardController } from './dashboard.controller';

export const dashboardRouter = Router();

// El Tablero es la pantalla de inicio visible para cualquier sesión autenticada;
// las pantallas de detalle ya aplican su propio RBAC. Aquí solo exigimos sesión + sucursal.
dashboardRouter.use(authenticate(), tenant());

dashboardRouter.get('/dashboard/recepcion', asyncHandler(dashboardController.recepcion));
dashboardRouter.get('/dashboard/limpieza', asyncHandler(dashboardController.limpieza));
dashboardRouter.get('/dashboard/caja', asyncHandler(dashboardController.caja));
dashboardRouter.get('/dashboard/turno', asyncHandler(dashboardController.turno));
