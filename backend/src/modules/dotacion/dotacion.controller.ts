import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { dotacionService } from './dotacion.service';
import { createDotacionSchema, updateDotacionSchema } from './dotacion.schema';

export const dotacionController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const roomTypeId = typeof req.query.roomTypeId === 'string' ? req.query.roomTypeId : undefined;
    res.status(200).json(ok(await dotacionService.list(req.scope, roomTypeId)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createDotacionSchema.parse(req.body);
    res.status(201).json(ok(await dotacionService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateDotacionSchema.parse(req.body);
    res.status(200).json(ok(await dotacionService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await dotacionService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
