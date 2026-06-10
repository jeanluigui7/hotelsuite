import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { fiscalService } from './fiscal.service';

export const fiscalController = {
  async panel(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await fiscalService.panel(req.scope)));
  },
};
