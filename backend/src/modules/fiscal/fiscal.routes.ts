import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { fiscalController } from './fiscal.controller';

export const fiscalRouter = Router();

fiscalRouter.use(authenticate(), tenant());

fiscalRouter.get('/fiscal/panel', requirePermission('finance', 'view'), asyncHandler(fiscalController.panel));
