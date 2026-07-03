import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { productsService } from './products.service';
import { createProductSchema, updateProductSchema } from './products.schema';

export const productsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const area = typeof req.query.area === 'string' ? req.query.area : undefined;
    const { items, meta } = await productsService.list(req.scope, params, area);
    res.status(200).json(ok(items, meta));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await productsService.getEntity(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createProductSchema.parse(req.body);
    res.status(201).json(ok(await productsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateProductSchema.parse(req.body);
    res.status(200).json(ok(await productsService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await productsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
