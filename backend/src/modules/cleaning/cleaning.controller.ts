import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { cleaningService, startSchema } from './cleaning.service';

export const cleaningController = {
  async linenItems(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.linenItems(req.scope)));
  },
  async roomsToClean(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.roomsToClean(req.scope)));
  },
  async start(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = startSchema.parse(req.body);
    res.status(201).json(ok(await cleaningService.start(req.scope, req.params.roomId, dto)));
  },
  async finish(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.finish(req.scope, req.params.roomId)));
  },
};
