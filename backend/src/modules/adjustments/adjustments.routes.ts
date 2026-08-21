import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { adjustmentsService, adjustmentSchema } from './adjustments.service';

export const adjustmentsRouter = Router();

adjustmentsRouter.use(authenticate(), tenant());

// Registrar un ajuste de inventario (transferencia, sobrante, vencido, merma, faltante).
adjustmentsRouter.post(
  '/adjustments',
  requirePermission('inventory', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = adjustmentSchema.parse(req.body);
    res.status(201).json(ok(await adjustmentsService.create(req.scope, dto)));
  }),
);

// Detalle interactivo de ajustes de un almacén (para el kardex).
adjustmentsRouter.get(
  '/adjustments/detail',
  requirePermission('inventory', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const { warehouseId, productId, from, to } = req.query as Record<string, string>;
    if (!warehouseId) throw new UnauthorizedError();
    res.status(200).json(ok(await adjustmentsService.detail(req.scope, { warehouseId, productId, from, to })));
  }),
);
