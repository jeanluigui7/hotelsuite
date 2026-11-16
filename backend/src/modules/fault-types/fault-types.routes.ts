import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { faultTypesController } from './fault-types.controller';

export const faultTypesRouter = Router();

faultTypesRouter.use(authenticate(), tenant());

// Catálogo para consumidores (modal "Reportar falla" en Recepción/Limpieza).
faultTypesRouter.get('/fault-types/catalog', requirePermission('operations', 'view'), asyncHandler(faultTypesController.catalog));

// Configurador (Configuraciones → Ítems de Mantenimiento → FALLA).
faultTypesRouter.get('/fault-types', requirePermission('settings', 'view'), asyncHandler(faultTypesController.list));
faultTypesRouter.get('/fault-types/:id', requirePermission('settings', 'view'), asyncHandler(faultTypesController.getById));
faultTypesRouter.post('/fault-types', requirePermission('settings', 'create'), asyncHandler(faultTypesController.create));
faultTypesRouter.put('/fault-types/:id', requirePermission('settings', 'edit'), asyncHandler(faultTypesController.update));
faultTypesRouter.delete('/fault-types/:id', requirePermission('settings', 'delete'), asyncHandler(faultTypesController.remove));
