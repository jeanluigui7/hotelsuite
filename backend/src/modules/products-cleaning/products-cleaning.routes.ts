import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { productsCleaningService } from './products-cleaning.service';

export const productsCleaningRouter = Router();

productsCleaningRouter.use(authenticate(), tenant());

// Kardex de PRODUCTOS-LIMPIEZA (misma base que recepción).
productsCleaningRouter.get(
  '/products-cleaning',
  requirePermission('inventory', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const { date, shift } = req.query as Record<string, string>;
    res.status(200).json(ok(await productsCleaningService.list(req.scope, { date, shift })));
  }),
);

// Detalle interactivo de SALIDAS (reposiciones de frigobar a habitación).
productsCleaningRouter.get(
  '/products-cleaning/salidas-detail',
  requirePermission('inventory', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const { productId, from, to } = req.query as Record<string, string>;
    res.status(200).json(ok(await productsCleaningService.salidasDetail(req.scope, { productId, from, to })));
  }),
);
