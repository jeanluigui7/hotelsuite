import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission, requireAnyPermission } from '../../middlewares/rbac.middleware';
import { frigobarReviewController } from './frigobar-review.controller';

export const frigobarReviewRouter = Router();

frigobarReviewRouter.use(authenticate(), tenant());

// Stock actual del frigobar de una habitación (solo lectura; visible para todos los usuarios operativos).
frigobarReviewRouter.get('/frigobar/room/:roomId/stock', requireAnyPermission(['operations', 'view'], ['settings', 'view']), asyncHandler(frigobarReviewController.roomStock));

// Revisar frigobar: housekeeping o recepción pueden revisar y registrar el consumo (operations).
frigobarReviewRouter.get('/frigobar/review/:stayId/start', requirePermission('operations', 'view'), asyncHandler(frigobarReviewController.start));
frigobarReviewRouter.post('/frigobar/review/:stayId', requirePermission('operations', 'edit'), asyncHandler(frigobarReviewController.submit));
// Reposición (parcial) del frigobar desde Recepción/Limpieza: datos del modal + envío.
frigobarReviewRouter.get('/frigobar/review/:id/reposition', requirePermission('operations', 'view'), asyncHandler(frigobarReviewController.repositionStart));
frigobarReviewRouter.post('/frigobar/review/:id/reposition', requirePermission('operations', 'edit'), asyncHandler(frigobarReviewController.reposition));
