import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { roleShiftsService } from './role-shifts.service';
import { saveRoleShiftsSchema } from './role-shifts.schema';

export const roleShiftsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await roleShiftsService.list(req.scope)));
  },
  async save(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = saveRoleShiftsSchema.parse(req.body);
    res.status(200).json(ok(await roleShiftsService.saveAll(req.scope, dto)));
  },
};
