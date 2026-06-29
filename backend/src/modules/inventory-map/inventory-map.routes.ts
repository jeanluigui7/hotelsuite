import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requireAnyPermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { inventoryMapService } from './inventory-map.service';

export const inventoryMapRouter = Router();

inventoryMapRouter.use(authenticate(), tenant());

inventoryMapRouter.get(
  '/inventory/map',
  requireAnyPermission(['inventory', 'view'], ['operations', 'view']),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await inventoryMapService.snapshot(req.scope)));
  }),
);
