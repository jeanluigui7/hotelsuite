import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { authenticate } from '../../middlewares/auth.middleware';
import { tenant } from '../../middlewares/tenant.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { reconciliationsService, unregisteredSaleSchema, attributeLossSchema } from './reconciliations.service';

export const reconciliationsRouter = Router();

reconciliationsRouter.use(authenticate(), tenant());

// Resumen de conciliación de un turno (esperado, declarado, diferencia original, regularizaciones, pendiente).
reconciliationsRouter.get(
  '/cash/:sessionId/reconciliation',
  requirePermission('finance', 'view'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reconciliationsService.summary(req.scope, req.params.sessionId)));
  }),
);

// Regularizar una VENTA NO REGISTRADA (reclasifica sobrante). Gerencia/caja.
reconciliationsRouter.post(
  '/cash/:sessionId/reconciliation/unregistered-sale',
  requirePermission('finance', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = unregisteredSaleSchema.parse(req.body);
    res.status(201).json(ok(await reconciliationsService.unregisteredSale(req.scope, req.params.sessionId, dto)));
  }),
);

// Atribuir un FALTANTE como PÉRDIDA AL COLABORADOR (solo administración: settings.edit).
reconciliationsRouter.post(
  '/reconciliation/attribute-loss',
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new UnauthorizedError();
    const dto = attributeLossSchema.parse(req.body);
    res.status(201).json(ok(await reconciliationsService.attributeLoss(req.scope, dto)));
  }),
);
