import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { laundryService } from './laundry.service';
import { moveSchema } from './laundry.schema';

export const laundryController = {
  async pending(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await laundryService.pending(req.scope)));
  },
  async inProcess(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await laundryService.inProcess(req.scope)));
  },
  async clean(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await laundryService.clean(req.scope)));
  },
  async send(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await laundryService.send(req.scope, moveSchema.parse(req.body))));
  },
  async receive(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await laundryService.receive(req.scope, moveSchema.parse(req.body))));
  },
};
