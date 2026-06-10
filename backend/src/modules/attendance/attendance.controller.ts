import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { attendanceService } from './attendance.service';
import { createAttendanceSchema } from './attendance.schema';

export const attendanceController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const { items, meta } = await attendanceService.list(req.scope, params, userId);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createAttendanceSchema.parse(req.body);
    res.status(201).json(ok(await attendanceService.create(req.scope, dto)));
  },
};
