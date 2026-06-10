import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { notesController } from './notes.controller';

export const notesRouter = Router();

notesRouter.use(authenticate(), tenant());

notesRouter.get('/notes', requirePermission('finance', 'view'), asyncHandler(notesController.list));
notesRouter.get('/notes/:id', requirePermission('finance', 'view'), asyncHandler(notesController.getById));
notesRouter.post('/notes', requirePermission('finance', 'create'), asyncHandler(notesController.create));
