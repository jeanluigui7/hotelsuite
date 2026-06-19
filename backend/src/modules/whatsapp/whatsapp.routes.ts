import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { whatsappController } from './whatsapp.controller';

export const whatsappRouter = Router();

whatsappRouter.use(authenticate(), tenant());

// Instances
whatsappRouter.get('/whatsapp/instances', requirePermission('whatsapp', 'view'), asyncHandler(whatsappController.listInstances));
whatsappRouter.post('/whatsapp/instances', requirePermission('whatsapp', 'create'), asyncHandler(whatsappController.createInstance));
whatsappRouter.put('/whatsapp/instances/:id', requirePermission('whatsapp', 'edit'), asyncHandler(whatsappController.updateInstance));
whatsappRouter.post('/whatsapp/instances/:id/toggle', requirePermission('whatsapp', 'edit'), asyncHandler(whatsappController.toggleInstance));
whatsappRouter.delete('/whatsapp/instances/:id', requirePermission('whatsapp', 'delete'), asyncHandler(whatsappController.removeInstance));

// Templates
whatsappRouter.get('/whatsapp/templates', requirePermission('whatsapp', 'view'), asyncHandler(whatsappController.listTemplates));
whatsappRouter.post('/whatsapp/templates', requirePermission('whatsapp', 'create'), asyncHandler(whatsappController.createTemplate));
whatsappRouter.put('/whatsapp/templates/:id', requirePermission('whatsapp', 'edit'), asyncHandler(whatsappController.updateTemplate));
whatsappRouter.delete('/whatsapp/templates/:id', requirePermission('whatsapp', 'delete'), asyncHandler(whatsappController.removeTemplate));

// Send / Logs
whatsappRouter.post('/whatsapp/send', requirePermission('whatsapp', 'create'), asyncHandler(whatsappController.send));
whatsappRouter.get('/whatsapp/logs', requirePermission('whatsapp', 'view'), asyncHandler(whatsappController.listLogs));

// Notify config (admin phone for request alerts, R5)
whatsappRouter.get('/whatsapp/notify-config', requirePermission('whatsapp', 'view'), asyncHandler(whatsappController.getNotifyConfig));
whatsappRouter.put('/whatsapp/notify-config', requirePermission('whatsapp', 'edit'), asyncHandler(whatsappController.setNotifyConfig));
