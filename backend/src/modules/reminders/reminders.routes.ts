import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { remindersController } from './reminders.controller';

export const remindersRouter = Router();

remindersRouter.use(authenticate(), tenant());

remindersRouter.get('/reminders', requirePermission('settings', 'view'), asyncHandler(remindersController.list));
remindersRouter.post('/reminders', requirePermission('settings', 'create'), asyncHandler(remindersController.create));
remindersRouter.put('/reminders/:id', requirePermission('settings', 'edit'), asyncHandler(remindersController.update));
remindersRouter.delete('/reminders/:id', requirePermission('settings', 'delete'), asyncHandler(remindersController.remove));
