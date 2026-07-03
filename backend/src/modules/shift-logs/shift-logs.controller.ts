import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { shiftLogsService } from './shift-logs.service';

const closeSchema = z.object({ role: z.enum(['RECEPCION', 'LIMPIEZA']) });

export const shiftLogsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    res.status(200).json(ok(await shiftLogsService.list(req.scope, { role, from, to })));
  },
  async get(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await shiftLogsService.get(req.scope, req.params.id)));
  },
  async close(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const { role } = closeSchema.parse(req.body);
    res.status(201).json(ok(await shiftLogsService.closeManual(req.scope, role)));
  },
};
