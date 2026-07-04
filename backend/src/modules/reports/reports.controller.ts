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
  async movements(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const q = req.query;
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    res.status(200).json(
      ok(
        await reportsService.movements(req.scope, {
          from: str(q.from) ? new Date(q.from as string) : undefined,
          to: str(q.to) ? new Date(q.to as string) : undefined,
          concept: str(q.concept),
          method: str(q.method),
          roomId: str(q.roomId),
          collaboratorId: str(q.collaboratorId),
          search: str(q.search),
        }),
      ),
    );
  },
  async inspections(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
    res.status(200).json(ok(await reportsService.inspections(req.scope, from, to)));
  },
};
