import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { inventoryCategoriesService } from './inventory-categories.service';
import {
  createInventoryCategorySchema,
  updateInventoryCategorySchema,
} from './inventory-categories.schema';

export const inventoryCategoriesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await inventoryCategoriesService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await inventoryCategoriesService.getById(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createInventoryCategorySchema.parse(req.body);
    res.status(201).json(ok(await inventoryCategoriesService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateInventoryCategorySchema.parse(req.body);
    res.status(200).json(ok(await inventoryCategoriesService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await inventoryCategoriesService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
