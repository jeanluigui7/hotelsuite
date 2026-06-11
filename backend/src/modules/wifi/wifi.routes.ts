import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { wifiController } from './wifi.controller';

export const wifiRouter = Router();

wifiRouter.use(authenticate(), tenant());

wifiRouter.get('/wifi-credentials', requirePermission('settings', 'view'), asyncHandler(wifiController.list));
wifiRouter.get('/wifi-credentials/:id', requirePermission('settings', 'view'), asyncHandler(wifiController.getById));
wifiRouter.post('/wifi-credentials', requirePermission('settings', 'create'), asyncHandler(wifiController.create));
wifiRouter.put('/wifi-credentials/:id', requirePermission('settings', 'edit'), asyncHandler(wifiController.update));
wifiRouter.delete('/wifi-credentials/:id', requirePermission('settings', 'delete'), asyncHandler(wifiController.remove));
