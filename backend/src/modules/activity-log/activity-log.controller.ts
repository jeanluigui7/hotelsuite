import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { activityLogService } from './activity-log.service';

export const activityLogController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const module = typeof req.query.module === 'string' ? req.query.module : undefined;
    const { items, meta } = await activityLogService.list(req.scope, params, module);
    res.status(200).json(ok(items, meta));
  },
};
