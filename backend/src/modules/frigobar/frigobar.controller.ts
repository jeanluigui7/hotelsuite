import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { frigobarService, bulkFrigobarSchema } from './frigobar.service';

export const frigobarController = {
  async listRooms(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await frigobarService.listRooms(req.scope)));
  },
  async bulkUpdate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await frigobarService.bulkUpdate(req.scope, bulkFrigobarSchema.parse(req.body))));
  },
};
