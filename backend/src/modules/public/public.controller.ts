import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { publicService } from './public.service';

export const publicController = {
  async branch(req: Request, res: Response): Promise<void> {
    res.status(200).json(ok(await publicService.branch(req.params.id)));
  },
  async rooms(req: Request, res: Response): Promise<void> {
    res.status(200).json(ok(await publicService.rooms(req.params.id)));
  },
  async landing(req: Request, res: Response): Promise<void> {
    res.status(200).json(ok(await publicService.landing(req.params.id)));
  },
};
