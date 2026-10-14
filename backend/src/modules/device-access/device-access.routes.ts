import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { deviceAccessController } from './device-access.controller';

export const deviceAccessRouter = Router();

deviceAccessRouter.use(authenticate(), tenant());

// Configuración de acceso por tipo de dispositivo y perfil (solo administración).
deviceAccessRouter.get('/device-access', requirePermission('settings', 'view'), asyncHandler(deviceAccessController.get));
deviceAccessRouter.put('/device-access', requirePermission('settings', 'edit'), asyncHandler(deviceAccessController.update));
