import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { laundryMachinesController } from './laundry-machines.controller';

export const laundryMachinesRouter = Router();

laundryMachinesRouter.use(authenticate(), tenant());

laundryMachinesRouter.get('/laundry-machines', requirePermission('settings', 'view'), asyncHandler(laundryMachinesController.list));
laundryMachinesRouter.post('/laundry-machines', requirePermission('settings', 'create'), asyncHandler(laundryMachinesController.create));
laundryMachinesRouter.put('/laundry-machines/:id', requirePermission('settings', 'edit'), asyncHandler(laundryMachinesController.update));
laundryMachinesRouter.delete('/laundry-machines/:id', requirePermission('settings', 'delete'), asyncHandler(laundryMachinesController.remove));
