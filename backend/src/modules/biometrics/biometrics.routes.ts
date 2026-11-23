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

// Agente local: token (generar/rotar) y estado. El huellero LAN no es alcanzable desde el VPS,
// así que un agente en la red del hotel empuja las marcas con este token.
biometricsRouter.get('/biometric-devices/:id/agent-status', requirePermission('settings', 'view'), asyncHandler(biometricsController.agentStatus));
biometricsRouter.post('/biometric-devices/:id/agent-token', requirePermission('settings', 'edit'), asyncHandler(biometricsController.generateAgentToken));
// ADMS / nube: estado y vinculación del número de serie del huellero.
biometricsRouter.get('/biometric-devices/:id/adms-status', requirePermission('settings', 'view'), asyncHandler(biometricsController.admsStatus));
biometricsRouter.post('/biometric-devices/:id/adms-serial', requirePermission('settings', 'edit'), asyncHandler(biometricsController.bindSerial));

biometricsRouter.get('/biometric-devices/:id/enrollments', requirePermission('settings', 'view'), asyncHandler(biometricsController.enrollments));
biometricsRouter.post('/biometric-devices/:id/enrollments', requirePermission('settings', 'create'), asyncHandler(biometricsController.enroll));
biometricsRouter.delete('/biometric-devices/:id/enrollments/:enrollmentId', requirePermission('settings', 'delete'), asyncHandler(biometricsController.removeEnrollment));
