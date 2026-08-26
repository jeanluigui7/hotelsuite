import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { masterFoliosController } from './master-folios.controller';

export const masterFoliosRouter = Router();

masterFoliosRouter.use(authenticate(), tenant());

masterFoliosRouter.get('/master-folios', requirePermission('operations', 'view'), asyncHandler(masterFoliosController.list));
masterFoliosRouter.get('/master-folios/:id', requirePermission('operations', 'view'), asyncHandler(masterFoliosController.detail));
masterFoliosRouter.post('/master-folios', requirePermission('operations', 'create'), asyncHandler(masterFoliosController.create));
masterFoliosRouter.patch('/master-folios/:id', requirePermission('operations', 'edit'), asyncHandler(masterFoliosController.update));
masterFoliosRouter.post('/master-folios/:id/stays', requirePermission('operations', 'edit'), asyncHandler(masterFoliosController.addStay));
masterFoliosRouter.delete('/master-folios/:id/stays/:stayId', requirePermission('operations', 'edit'), asyncHandler(masterFoliosController.removeStay));
