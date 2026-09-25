import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { customRateBlockService, updateCustomRateBlockSchema } from './custom-rate-block.service';

export const customRateBlockController = {
  async get(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await customRateBlockService.get(req.scope)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await customRateBlockService.update(req.scope, updateCustomRateBlockSchema.parse(req.body))));
  },
};
