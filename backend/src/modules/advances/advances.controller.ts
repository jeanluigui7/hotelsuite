import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { advancesService } from './advances.service';
import { applyAdvanceSchema, createAdvanceSchema } from './advances.schema';

export const advancesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await advancesService.list(req.scope)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createAdvanceSchema.parse(req.body);
    res.status(201).json(ok(await advancesService.create(req.scope, dto)));
  },
  async apply(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = applyAdvanceSchema.parse(req.body);
    res.status(200).json(ok(await advancesService.apply(req.scope, req.params.id, dto)));
  },
};
