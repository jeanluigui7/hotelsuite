import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { receptionInventoryController } from './reception-inventory.controller';

export const receptionInventoryRouter = Router();

receptionInventoryRouter.use(authenticate(), tenant());

const base = '/reception-inventory';
receptionInventoryRouter.get(base, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.list));
receptionInventoryRouter.get(`${base}/requests`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.listRequests));
receptionInventoryRouter.post(`${base}/requests`, requirePermission('inventory', 'create'), asyncHandler(receptionInventoryController.createRequest));
receptionInventoryRouter.post(`${base}/requests/:id/send`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.sendRequest));
receptionInventoryRouter.post(`${base}/send-items`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.sendItems));
receptionInventoryRouter.post(`${base}/requests/delete-items`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.deleteItems));
receptionInventoryRouter.post(`${base}/requests/:id/receive`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.receiveRequest));
receptionInventoryRouter.post(`${base}/requests/:id/accept`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.acceptRequest));
receptionInventoryRouter.post(`${base}/requests/:id/reject`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.rejectRequest));
receptionInventoryRouter.post(`${base}/write-off`, requirePermission('inventory', 'delete'), asyncHandler(receptionInventoryController.writeOff));
// Modo ciego de recepción: estado (cualquier rol con acceso al inventario) y toggle manual (Admin en el service).
receptionInventoryRouter.get(`${base}/blind`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.blindStatus));
receptionInventoryRouter.post(`${base}/blind`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.setBlind));
// Finalizar el conteo físico del turno → revela el inventario (Recepción puede hacerlo).
receptionInventoryRouter.post(`${base}/count`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.finalizeCount));
// Auditoría de conteo (solo Admin/Gerente — validado también en el service). Solo lectura.
receptionInventoryRouter.get(`${base}/audit/available`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.auditAvailable));
receptionInventoryRouter.get(`${base}/audit`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.auditData));
receptionInventoryRouter.post(`${base}/audit/review`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.auditReview));
receptionInventoryRouter.get(`${base}/print-queue`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.printQueue));
receptionInventoryRouter.post(`${base}/print-queue/:id/printed`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.markPrinted));
