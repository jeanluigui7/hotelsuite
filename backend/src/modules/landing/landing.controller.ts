import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { landingService, updateLandingSchema } from './landing.service';

export const landingController = {
  async get(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await landingService.getConfig(req.scope)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateLandingSchema.parse(req.body);
    res.status(200).json(ok(await landingService.updateConfig(req.scope, dto)));
  },
};
