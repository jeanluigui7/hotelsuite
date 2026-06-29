import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { roomCleaningService } from './room-cleaning.service';
import { retiroSchema, reposicionSchema, finalizarSchema } from './room-cleaning.schema';

export const roomCleaningController = {
  async retiro(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = retiroSchema.parse(req.body);
    res.status(200).json(ok(await roomCleaningService.retiro(req.scope, req.params.id, dto)));
  },
  async reposicion(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = reposicionSchema.parse(req.body);
    res.status(200).json(ok(await roomCleaningService.reposicion(req.scope, req.params.id, dto)));
  },
  async finalizar(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = finalizarSchema.parse(req.body);
    res.status(200).json(ok(await roomCleaningService.finalizar(req.scope, req.params.id, dto)));
  },
};
