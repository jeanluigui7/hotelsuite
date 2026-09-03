import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { wifiController } from './wifi.controller';

export const wifiRouter = Router();

wifiRouter.use(authenticate(), tenant());

// Vista operativa (recepción = operations, admin = settings). La lista ENMASCARA el voucher salvo
// que el usuario tenga settings:view (admin). Asignar e imprimir el ticket también para recepción.
wifiRouter.get('/wifi-credentials', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(wifiController.list));
wifiRouter.get('/wifi-credentials/summary', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(wifiController.summary));
wifiRouter.get('/wifi-credentials/:id/ticket', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(wifiController.ticket));
wifiRouter.post('/wifi-credentials/:id/assign', requireAnyPermission(['settings', 'edit'], ['operations', 'edit']), asyncHandler(wifiController.assign));
// Administración del pool (SOLO administración): revelar por id, crear, importar, editar, eliminar.
wifiRouter.get('/wifi-credentials/:id', requirePermission('settings', 'view'), asyncHandler(wifiController.getById));
wifiRouter.post('/wifi-credentials', requirePermission('settings', 'create'), asyncHandler(wifiController.create));
wifiRouter.post('/wifi-credentials/bulk', requirePermission('settings', 'create'), asyncHandler(wifiController.createBulk));
wifiRouter.post('/wifi-credentials/import', requirePermission('settings', 'create'), asyncHandler(wifiController.importRows));
wifiRouter.post('/wifi-credentials/bulk-delete', requirePermission('settings', 'delete'), asyncHandler(wifiController.bulkRemove));
wifiRouter.put('/wifi-credentials/:id', requirePermission('settings', 'edit'), asyncHandler(wifiController.update));
wifiRouter.delete('/wifi-credentials/:id', requirePermission('settings', 'delete'), asyncHandler(wifiController.remove));
