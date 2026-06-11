import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { logisticsService } from './logistics.service';

export const logisticsController = {
  async valuation(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await logisticsService.valuation(req.scope)));
  },
  async reorder(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await logisticsService.reorder(req.scope)));
  },
  async kardex(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
    const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
    res.status(200).json(ok(await logisticsService.kardex(req.scope, productId, warehouseId)));
  },
  async profit(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
    res.status(200).json(ok(await logisticsService.profit(req.scope, from, to)));
  },
};
