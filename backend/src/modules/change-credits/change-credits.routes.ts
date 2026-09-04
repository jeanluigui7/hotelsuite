import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { changeCreditsController } from './change-credits.controller';

export const changeCreditsRouter = Router();

changeCreditsRouter.use(authenticate(), tenant());

// Vuelto pendiente: operación de recepción (finanzas de su turno).
changeCreditsRouter.get('/change-credits/pending', requirePermission('finance', 'view'), asyncHandler(changeCreditsController.pendingAll));
changeCreditsRouter.get('/change-credits/by-stay/:stayId', requirePermission('finance', 'view'), asyncHandler(changeCreditsController.pendingByStay));
changeCreditsRouter.post('/change-credits', requirePermission('finance', 'create'), asyncHandler(changeCreditsController.createPending));
changeCreditsRouter.post('/change-credits/by-stay/:stayId/deliver', requirePermission('finance', 'edit'), asyncHandler(changeCreditsController.deliverByStay));
changeCreditsRouter.post('/change-credits/:id/deliver', requirePermission('finance', 'edit'), asyncHandler(changeCreditsController.deliver));
