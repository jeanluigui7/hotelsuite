import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { biometricsController } from './biometrics.controller';

export const biometricsRouter = Router();

biometricsRouter.use(authenticate(), tenant());

// Administración de dispositivos: Configuraciones › Huella Digital (módulo settings).
biometricsRouter.get('/biometric-devices', requirePermission('settings', 'view'), asyncHandler(biometricsController.list));
biometricsRouter.post('/biometric-devices', requirePermission('settings', 'create'), asyncHandler(biometricsController.create));
biometricsRouter.put('/biometric-devices/:id', requirePermission('settings', 'edit'), asyncHandler(biometricsController.update));
biometricsRouter.delete('/biometric-devices/:id', requirePermission('settings', 'delete'), asyncHandler(biometricsController.remove));

biometricsRouter.post('/biometric-devices/:id/test', requirePermission('settings', 'edit'), asyncHandler(biometricsController.test));
biometricsRouter.post('/biometric-devices/:id/connect', requirePermission('settings', 'edit'), asyncHandler(biometricsController.connect));
biometricsRouter.post('/biometric-devices/:id/disconnect', requirePermission('settings', 'edit'), asyncHandler(biometricsController.disconnect));

biometricsRouter.get('/biometric-devices/:id/enrollments', requirePermission('settings', 'view'), asyncHandler(biometricsController.enrollments));
biometricsRouter.post('/biometric-devices/:id/enrollments', requirePermission('settings', 'create'), asyncHandler(biometricsController.enroll));
biometricsRouter.delete('/biometric-devices/:id/enrollments/:enrollmentId', requirePermission('settings', 'delete'), asyncHandler(biometricsController.removeEnrollment));
