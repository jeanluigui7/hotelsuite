import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { movementsService } from './movements.service';
import { adjustSchema, transferSchema } from './movements.schema';

export const movementsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const { items, meta } = await movementsService.list(req.scope, params, { productId, warehouseId, type });
    res.status(200).json(ok(items, meta));
  },
  async adjust(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = adjustSchema.parse(req.body);
    res.status(201).json(ok(await movementsService.adjust(req.scope, dto)));
  },
  async transfer(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = transferSchema.parse(req.body);
    res.status(201).json(ok(await movementsService.transfer(req.scope, dto)));
  },
};
