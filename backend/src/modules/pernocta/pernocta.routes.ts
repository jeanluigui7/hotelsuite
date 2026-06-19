import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { pernoctaController } from './pernocta.controller';

export const pernoctaRouter = Router();

pernoctaRouter.use(authenticate(), tenant());

pernoctaRouter.get('/pernocta/config', requirePermission('settings', 'view'), asyncHandler(pernoctaController.get));
pernoctaRouter.put('/pernocta/config', requirePermission('settings', 'edit'), asyncHandler(pernoctaController.update));
// Cotización usada por el check-in (recepción/operaciones).
pernoctaRouter.post('/pernocta/quote', requirePermission('operations', 'view'), asyncHandler(pernoctaController.quote));
