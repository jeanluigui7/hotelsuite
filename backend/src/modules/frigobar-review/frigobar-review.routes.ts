import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { frigobarReviewController } from './frigobar-review.controller';

export const frigobarReviewRouter = Router();

frigobarReviewRouter.use(authenticate(), tenant());

// Revisar frigobar: housekeeping o recepción pueden revisar y registrar el consumo (operations).
frigobarReviewRouter.get('/frigobar/review/:stayId/start', requirePermission('operations', 'view'), asyncHandler(frigobarReviewController.start));
frigobarReviewRouter.post('/frigobar/review/:stayId', requirePermission('operations', 'edit'), asyncHandler(frigobarReviewController.submit));
frigobarReviewRouter.post('/frigobar/review/:id/reposition', requirePermission('operations', 'edit'), asyncHandler(frigobarReviewController.reposition));
