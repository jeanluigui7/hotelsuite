import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { laundryTasksService } from './laundry-tasks.service';
import { createLaundryTaskSchema, updateLaundryTaskSchema } from './laundry-tasks.schema';

export const laundryTasksController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await laundryTasksService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createLaundryTaskSchema.parse(req.body);
    res.status(201).json(ok(await laundryTasksService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateLaundryTaskSchema.parse(req.body);
    res.status(200).json(ok(await laundryTasksService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await laundryTasksService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
