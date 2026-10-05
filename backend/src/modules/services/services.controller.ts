import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { servicesService, chargeSchema } from './services.service';

export const servicesController = {
  async catalog(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await servicesService.catalog(req.scope)));
  },
  async catalogTree(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : 'SERVICIO';
    res.status(200).json(ok(await servicesService.catalogTree(req.scope, tipo)));
  },
  async availability(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const stayId = typeof req.query.stayId === 'string' ? req.query.stayId : '';
    const conceptId = typeof req.query.conceptId === 'string' ? req.query.conceptId : '';
    res.status(200).json(ok(await servicesService.availability(req.scope, stayId, conceptId)));
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
  async variants(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await servicesService.variants(req.scope, req.params.id)));
  },
  async deliver(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const linenItemId = typeof req.body?.linenItemId === 'string' && req.body.linenItemId ? req.body.linenItemId : undefined;
    res.status(200).json(ok(await servicesService.deliver(req.scope, req.params.id, linenItemId)));
  },
  async reject(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await servicesService.reject(req.scope, req.params.id)));
  },
};
