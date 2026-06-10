import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { cashService } from './cash.service';
import { closeCashSchema, openCashSchema } from './cash.schema';

export const cashController = {
  async current(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cashService.current(req.scope)));
  },
  async open(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = openCashSchema.parse(req.body);
    res.status(201).json(ok(await cashService.open(req.scope, dto)));
  },
  async close(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = closeCashSchema.parse(req.body);
    res.status(200).json(ok(await cashService.close(req.scope, dto)));
  },
};
