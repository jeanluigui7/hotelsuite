import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { proformasController } from './proformas.controller';

export const proformasRouter = Router();

proformasRouter.use(authenticate(), tenant());

proformasRouter.get('/proformas', requirePermission('operations', 'view'), asyncHandler(proformasController.list));
proformasRouter.post('/proformas', requirePermission('operations', 'create'), asyncHandler(proformasController.create));
proformasRouter.post('/proformas/:id/convert', requirePermission('operations', 'edit'), asyncHandler(proformasController.convert));
