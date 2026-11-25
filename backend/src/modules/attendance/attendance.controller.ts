import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { attendanceService } from './attendance.service';
import { attendanceReportService } from './attendance-report.service';
import { createAttendanceSchema, dailyQuerySchema, monthlyQuerySchema } from './attendance.schema';

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
  /** Control diario: una fila por trabajador y jornada (fecha o rango). */
  async daily(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const q = dailyQuerySchema.parse(req.query);
    const data = await attendanceReportService.daily(req.scope, q.from, q.to ?? q.from, { role: q.role, shift: q.shift, userId: q.userId, search: q.search });
    res.status(200).json(ok(data));
  },
  /** Resumen mensual: una fila por persona con calendario + totales. */
  async monthly(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const q = monthlyQuerySchema.parse(req.query);
    const data = await attendanceReportService.monthly(req.scope, q.month, { role: q.role, userId: q.userId, search: q.search });
    res.status(200).json(ok(data));
  },
};
