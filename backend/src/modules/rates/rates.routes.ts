import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { ratesController } from './rates.controller';

export const ratesRouter = Router();

ratesRouter.use(authenticate(), tenant());

// Base rates — la lectura la usan settings (configuración) y operations (check-in).
ratesRouter.get('/rates', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(ratesController.listRates));
ratesRouter.post('/rates', requirePermission('settings', 'create'), asyncHandler(ratesController.createRate));
ratesRouter.put('/rates/:id', requirePermission('settings', 'edit'), asyncHandler(ratesController.updateRate));
ratesRouter.delete('/rates/:id', requirePermission('settings', 'delete'), asyncHandler(ratesController.removeRate));

// Custom rates
ratesRouter.get('/custom-rates', requirePermission('settings', 'view'), asyncHandler(ratesController.listCustomRates));
ratesRouter.post('/custom-rates', requirePermission('settings', 'create'), asyncHandler(ratesController.createCustomRate));
ratesRouter.put('/custom-rates/:id', requirePermission('settings', 'edit'), asyncHandler(ratesController.updateCustomRate));
ratesRouter.delete('/custom-rates/:id', requirePermission('settings', 'delete'), asyncHandler(ratesController.removeCustomRate));
