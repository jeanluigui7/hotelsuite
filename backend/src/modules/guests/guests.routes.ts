import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { guestsController } from './guests.controller';

export const guestsRouter = Router();

guestsRouter.use(authenticate(), tenant());

// Clientes (huéspedes) — globales. Lectura para recepción (operations) y administración (settings);
// edición/eliminación/exportación solo administración; Lista Negra: agregar recepción+admin, quitar solo admin.
guestsRouter.get('/guests-lookup', requirePermission('operations', 'view'), asyncHandler(guestsController.lookup));
guestsRouter.get('/guests', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(guestsController.list));
guestsRouter.get('/guests/stats', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(guestsController.stats));
guestsRouter.get('/guests/blacklist', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(guestsController.blacklist));
// Exportar toda la base: SOLO administración (recepción no puede exportar).
guestsRouter.get('/guests/export', requirePermission('settings', 'view'), asyncHandler(guestsController.exportRows));
guestsRouter.get('/guests/:id', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(guestsController.getById));
guestsRouter.post('/guests', requireAnyPermission(['settings', 'create'], ['operations', 'create']), asyncHandler(guestsController.create));
guestsRouter.put('/guests/:id', requirePermission('settings', 'edit'), asyncHandler(guestsController.update));
guestsRouter.delete('/guests/:id', requirePermission('settings', 'delete'), asyncHandler(guestsController.remove));
// Lista Negra: agregar = recepción + administración; quitar = SOLO administración.
guestsRouter.post('/guests/:id/blacklist', requireAnyPermission(['settings', 'edit'], ['operations', 'edit']), asyncHandler(guestsController.addToBlacklist));
guestsRouter.delete('/guests/:id/blacklist', requirePermission('settings', 'edit'), asyncHandler(guestsController.removeFromBlacklist));
