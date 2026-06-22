import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { guestsController } from './guests.controller';

export const guestsRouter = Router();

guestsRouter.use(authenticate(), tenant());

// Clientes (huéspedes) — globales, gestionados desde Configuraciones.
// Lookup por documento para el check-in (recepción): huésped + deudas. Permiso operativo.
guestsRouter.get('/guests-lookup', requirePermission('operations', 'view'), asyncHandler(guestsController.lookup));
guestsRouter.get('/guests', requirePermission('settings', 'view'), asyncHandler(guestsController.list));
// Lectura/creación puntual también desde el check-in (operations), además de Configuraciones.
guestsRouter.get('/guests/:id', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(guestsController.getById));
guestsRouter.post('/guests', requireAnyPermission(['settings', 'create'], ['operations', 'create']), asyncHandler(guestsController.create));
guestsRouter.put('/guests/:id', requirePermission('settings', 'edit'), asyncHandler(guestsController.update));
guestsRouter.delete('/guests/:id', requirePermission('settings', 'delete'), asyncHandler(guestsController.remove));
