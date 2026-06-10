import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { foliosController } from './folios.controller';

export const foliosRouter = Router();

foliosRouter.use(authenticate(), tenant());

foliosRouter.get('/folios', requirePermission('finance', 'view'), asyncHandler(foliosController.list));
foliosRouter.get('/folios/:id', requirePermission('finance', 'view'), asyncHandler(foliosController.getById));
foliosRouter.post('/folios', requirePermission('finance', 'create'), asyncHandler(foliosController.create));
foliosRouter.put('/folios/:id', requirePermission('finance', 'edit'), asyncHandler(foliosController.update));
foliosRouter.delete('/folios/:id', requirePermission('finance', 'delete'), asyncHandler(foliosController.remove));
