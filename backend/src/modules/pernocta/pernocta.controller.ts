import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { pernoctaService, updatePernoctaSchema } from './pernocta.service';

export const pernoctaController = {
  async get(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await pernoctaService.get(req.scope)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updatePernoctaSchema.parse(req.body);
    res.status(200).json(ok(await pernoctaService.update(req.scope, dto)));
  },
  async quote(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const raw = typeof req.body?.checkInAt === 'string' ? req.body.checkInAt : undefined;
    const checkInAt = raw ? new Date(raw) : new Date();
    if (Number.isNaN(checkInAt.getTime())) throw new ValidationError('checkInAt inválido');
    const nights = Number(req.body?.nights) > 0 ? Number(req.body.nights) : 1;
    res.status(200).json(ok(await pernoctaService.quoteCheckIn(req.scope, checkInAt, nights)));
  },
};
