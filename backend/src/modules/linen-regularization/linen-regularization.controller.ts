import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { linenRegularizationService, createRegularizationSchema } from './linen-regularization.service';

export const linenRegularizationController = {
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createRegularizationSchema.parse(req.body);
    res.status(201).json(ok(await linenRegularizationService.create(req.scope, dto)));
  },
  async blocked(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenRegularizationService.blockedFloors(req.scope)));
  },
  async items(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenRegularizationService.items(req.scope)));
  },
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenRegularizationService.list(req.scope)));
  },
  async pendingCount(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok({ count: await linenRegularizationService.pendingCount(req.scope) }));
  },
  async approve(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenRegularizationService.approve(req.scope, req.params.id)));
  },
  async reject(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    res.status(200).json(ok(await linenRegularizationService.reject(req.scope, req.params.id, note)));
  },
};
