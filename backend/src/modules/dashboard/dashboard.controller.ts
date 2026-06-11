import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { dashboardService } from './dashboard.service';

export const dashboardController = {
  async recepcion(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await dashboardService.recepcion(req.scope)));
  },
  async limpieza(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await dashboardService.limpieza(req.scope)));
  },
  async caja(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await dashboardService.caja(req.scope)));
  },
  async turno(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await dashboardService.turno(req.scope)));
  },
};
