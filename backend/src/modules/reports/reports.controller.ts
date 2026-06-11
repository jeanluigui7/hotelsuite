import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { reportsService } from './reports.service';

export const reportsController = {
  async rooms(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reportsService.rooms(req.scope)));
  },
  async housekeeping(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reportsService.housekeeping(req.scope)));
  },
  async salesDetailed(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
    res.status(200).json(ok(await reportsService.salesDetailed(req.scope, from, to)));
  },
  async productLimit(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reportsService.productLimit(req.scope)));
  },
};
