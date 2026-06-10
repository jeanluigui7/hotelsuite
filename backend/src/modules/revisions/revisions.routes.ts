import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { revisionsController } from './revisions.controller';

export const revisionsRouter = Router();

revisionsRouter.use(authenticate(), tenant());

revisionsRouter.get('/revisions', requirePermission('operations', 'view'), asyncHandler(revisionsController.list));
revisionsRouter.post('/revisions', requirePermission('operations', 'create'), asyncHandler(revisionsController.create));
revisionsRouter.put('/revisions/:id', requirePermission('operations', 'edit'), asyncHandler(revisionsController.update));
revisionsRouter.delete('/revisions/:id', requirePermission('operations', 'delete'), asyncHandler(revisionsController.remove));
