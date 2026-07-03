import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { cashService } from './cash.service';
import { closeCashSchema, movementSchema, openCashSchema } from './cash.schema';

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
  async addMovement(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = movementSchema.parse(req.body);
    res.status(201).json(ok(await cashService.addMovement(req.scope, dto)));
  },
  async sessions(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const { items, meta } = await cashService.listSessions(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async report(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cashService.report(req.scope, req.params.id)));
  },
};
