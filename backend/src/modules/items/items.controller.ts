import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { itemsService } from './items.service';
import { createItemSchema, updateItemSchema } from './items.schema';

export const itemsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const { items, meta } = await itemsService.list(req.scope, params, kind);
    res.status(200).json(ok(items, meta));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await itemsService.getById(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createItemSchema.parse(req.body);
    res.status(201).json(ok(await itemsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateItemSchema.parse(req.body);
    res.status(200).json(ok(await itemsService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await itemsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
