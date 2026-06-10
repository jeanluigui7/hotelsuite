import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { conciergeService } from './concierge.service';
import { createConciergeSchema, updateConciergeSchema } from './concierge.schema';

export const conciergeController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await conciergeService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createConciergeSchema.parse(req.body);
    res.status(201).json(ok(await conciergeService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateConciergeSchema.parse(req.body);
    res.status(200).json(ok(await conciergeService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await conciergeService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
