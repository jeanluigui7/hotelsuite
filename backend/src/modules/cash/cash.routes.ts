import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { cashController } from './cash.controller';

export const cashRouter = Router();

cashRouter.use(authenticate(), tenant());

cashRouter.get('/cash/current', requirePermission('finance', 'view'), asyncHandler(cashController.current));
cashRouter.get('/cash/sessions', requirePermission('finance', 'view'), asyncHandler(cashController.sessions));
cashRouter.post('/cash/open', requirePermission('finance', 'create'), asyncHandler(cashController.open));
cashRouter.post('/cash/close', requirePermission('finance', 'edit'), asyncHandler(cashController.close));
cashRouter.post('/cash/movements', requirePermission('finance', 'create'), asyncHandler(cashController.addMovement));
cashRouter.put('/cash/movements/:id', requirePermission('finance', 'edit'), asyncHandler(cashController.updateMovement));
cashRouter.delete('/cash/movements/:id', requirePermission('finance', 'edit'), asyncHandler(cashController.deleteMovement));
cashRouter.post('/cash/sessions/:id/reopen', requirePermission('finance', 'edit'), asyncHandler(cashController.reopen));

// Detalle del turno para el modal de caja (Finanzas).
cashRouter.get('/cash/sessions/:id/detail', requirePermission('finance', 'view'), asyncHandler(cashController.detail));

// Cuadro de Turno (reporte) — bajo el módulo de reportes.
cashRouter.get('/cash/sessions/:id/report', requirePermission('reports', 'view'), asyncHandler(cashController.report));
