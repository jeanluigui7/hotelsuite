import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { servicesService, chargeSchema } from './services.service';

export const servicesController = {
  async catalog(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await servicesService.catalog(req.scope)));
  },
  async charge(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = chargeSchema.parse(req.body);
    res.status(201).json(ok(await servicesService.charge(req.scope, dto)));
  },
  async supplies(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.status(200).json(ok(await servicesService.supplies(req.scope, status)));
  },
  async deliver(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await servicesService.deliver(req.scope, req.params.id)));
  },
};
