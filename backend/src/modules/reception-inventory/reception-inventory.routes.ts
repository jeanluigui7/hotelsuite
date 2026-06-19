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
receptionInventoryRouter.post(`${base}/requests/:id/receive`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.receiveRequest));
receptionInventoryRouter.post(`${base}/write-off`, requirePermission('inventory', 'delete'), asyncHandler(receptionInventoryController.writeOff));
receptionInventoryRouter.get(`${base}/print-queue`, requirePermission('inventory', 'view'), asyncHandler(receptionInventoryController.printQueue));
receptionInventoryRouter.post(`${base}/print-queue/:id/printed`, requirePermission('inventory', 'edit'), asyncHandler(receptionInventoryController.markPrinted));
