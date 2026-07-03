import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { salesService } from './sales.service';
import { correctSaleSchema, createSaleSchema } from './sales.schema';

export const salesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const cashSessionId = typeof req.query.cashSessionId === 'string' ? req.query.cashSessionId : undefined;
    const stayId = typeof req.query.stayId === 'string' ? req.query.stayId : undefined;
    const { items, meta } = await salesService.list(req.scope, params, { status, cashSessionId, stayId });
    res.status(200).json(ok(items, meta));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await salesService.getById(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createSaleSchema.parse(req.body);
    res.status(201).json(ok(await salesService.create(req.scope, dto)));
  },
  async cancel(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await salesService.cancel(req.scope, req.params.id)));
  },
  async correct(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = correctSaleSchema.parse(req.body);
    res.status(200).json(ok(await salesService.correct(req.scope, req.params.id, dto)));
  },
};
