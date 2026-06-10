import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { revisionsService } from './revisions.service';
import { createRevisionSchema, updateRevisionSchema } from './revisions.schema';

export const revisionsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await revisionsService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createRevisionSchema.parse(req.body);
    res.status(201).json(ok(await revisionsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateRevisionSchema.parse(req.body);
    res.status(200).json(ok(await revisionsService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await revisionsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
