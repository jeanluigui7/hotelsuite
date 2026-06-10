import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { observationsService } from './observations.service';
import { createObservationSchema, updateObservationSchema } from './observations.schema';

export const observationsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await observationsService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createObservationSchema.parse(req.body);
    res.status(201).json(ok(await observationsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateObservationSchema.parse(req.body);
    res.status(200).json(ok(await observationsService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await observationsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
