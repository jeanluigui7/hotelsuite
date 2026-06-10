import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { checklistController } from './checklist.controller';

export const checklistRouter = Router();

checklistRouter.use(authenticate(), tenant());

checklistRouter.get('/checklist-items', requirePermission('settings', 'view'), asyncHandler(checklistController.list));
checklistRouter.post('/checklist-items', requirePermission('settings', 'create'), asyncHandler(checklistController.create));
checklistRouter.put('/checklist-items/:id', requirePermission('settings', 'edit'), asyncHandler(checklistController.update));
checklistRouter.delete('/checklist-items/:id', requirePermission('settings', 'delete'), asyncHandler(checklistController.remove));
