import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { changeCreditsService, createPendingChangeSchema } from './change-credits.service';

export const changeCreditsController = {
  async createPending(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createPendingChangeSchema.parse(req.body);
    res.status(201).json(ok(await changeCreditsService.createPending(req.scope, dto)));
  },
  async pendingByStay(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await changeCreditsService.pendingByStay(req.scope, req.params.stayId)));
  },
  async pendingAll(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await changeCreditsService.pendingAll(req.scope)));
  },
  async deliver(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await changeCreditsService.deliver(req.scope, req.params.id)));
  },
  async deliverByStay(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await changeCreditsService.deliverByStay(req.scope, req.params.stayId)));
  },
};
