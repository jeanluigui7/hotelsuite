import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { fpLoginController } from './fp-login.controller';

export const fpLoginRouter = Router();

// ── Login por huella (PÚBLICO, pre-sesión) ──
// El modal sondea el estado; la sesión se entrega cuando el huellero empuja la marca (ADMS).
fpLoginRouter.post('/auth/fingerprint/login-mode', asyncHandler(fpLoginController.loginMode));
fpLoginRouter.post('/auth/fingerprint/login-request', asyncHandler(fpLoginController.loginRequest));
fpLoginRouter.get('/auth/fingerprint/login/:id', asyncHandler(fpLoginController.loginPoll));
fpLoginRouter.post('/auth/fingerprint/cancel/:id', asyncHandler(fpLoginController.cancel));

// ── Logout / fin de turno por huella (AUTENTICADO) ──
fpLoginRouter.post('/auth/fingerprint/logout-request', authenticate(), tenant(), asyncHandler(fpLoginController.logoutRequest));
fpLoginRouter.get('/auth/fingerprint/logout/:id', authenticate(), tenant(), asyncHandler(fpLoginController.logoutPoll));

// ── Configuración: roles que exigen huella (módulo settings) ──
fpLoginRouter.get('/biometrics/login-config', authenticate(), tenant(), requirePermission('settings', 'view'), asyncHandler(fpLoginController.getConfig));
fpLoginRouter.put('/biometrics/login-config', authenticate(), tenant(), requirePermission('settings', 'edit'), asyncHandler(fpLoginController.saveConfig));

// ── ID biométrico del usuario desde RRHH › Usuarios (módulo hr) ──
fpLoginRouter.get('/biometrics/user/:userId/pin', authenticate(), tenant(), requirePermission('hr', 'view'), asyncHandler(fpLoginController.getUserPin));
fpLoginRouter.put('/biometrics/user/:userId/pin', authenticate(), tenant(), requirePermission('hr', 'edit'), asyncHandler(fpLoginController.setUserPin));
