import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { activityLogService, activityQuerySchema } from './activity-log.service';

export const activityLogController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const q = activityQuerySchema.parse(req.query);
    const { items, meta } = await activityLogService.list(req.scope, q);
    res.status(200).json(ok(items, meta));
  },
};
