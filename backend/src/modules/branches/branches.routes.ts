import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { branchesController } from './branches.controller';

export const branchesRouter = Router();

branchesRouter.use(authenticate(), tenant());

// Listing accessible branches only needs to be authenticated (used by the branch switcher).
branchesRouter.get('/branches', asyncHandler(branchesController.list));
branchesRouter.get('/branches/:id', asyncHandler(branchesController.getById));

// Mutations are restricted to the settings module.
branchesRouter.post('/branches', requirePermission('settings', 'create'), asyncHandler(branchesController.create));
branchesRouter.put('/branches/:id', requirePermission('settings', 'edit'), asyncHandler(branchesController.update));
branchesRouter.delete('/branches/:id', requirePermission('settings', 'delete'), asyncHandler(branchesController.remove));
