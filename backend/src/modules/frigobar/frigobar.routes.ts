import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requireAnyPermission } from '../../middlewares/rbac.middleware';
import { frigobarController } from './frigobar.controller';

export const frigobarRouter = Router();

frigobarRouter.use(authenticate(), tenant());

// Configuración de frigobar (admin): ver estado y activar/desactivar por habitación.
frigobarRouter.get('/frigobar/rooms', requireAnyPermission(['settings', 'view'], ['operations', 'view']), asyncHandler(frigobarController.listRooms));
frigobarRouter.post('/frigobar/rooms/bulk', requireAnyPermission(['settings', 'edit'], ['operations', 'edit']), asyncHandler(frigobarController.bulkUpdate));
