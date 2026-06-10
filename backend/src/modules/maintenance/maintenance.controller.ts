import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { maintenanceService } from './maintenance.service';
import { createMaintenanceSchema, updateMaintenanceSchema } from './maintenance.schema';

export const maintenanceController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await maintenanceService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createMaintenanceSchema.parse(req.body);
    res.status(201).json(ok(await maintenanceService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateMaintenanceSchema.parse(req.body);
    res.status(200).json(ok(await maintenanceService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await maintenanceService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
