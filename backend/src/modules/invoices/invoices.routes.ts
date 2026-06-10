import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { invoicesController } from './invoices.controller';

export const invoicesRouter = Router();

invoicesRouter.use(authenticate(), tenant());

invoicesRouter.get('/invoices', requirePermission('finance', 'view'), asyncHandler(invoicesController.list));
invoicesRouter.get('/invoices/:id', requirePermission('finance', 'view'), asyncHandler(invoicesController.getById));
invoicesRouter.post('/invoices', requirePermission('finance', 'create'), asyncHandler(invoicesController.issue));
invoicesRouter.post('/invoices/:id/void', requirePermission('finance', 'edit'), asyncHandler(invoicesController.void));
