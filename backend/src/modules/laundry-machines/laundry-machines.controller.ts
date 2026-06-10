import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { laundryMachinesService } from './laundry-machines.service';
import { createLaundryMachineSchema, updateLaundryMachineSchema } from './laundry-machines.schema';

export const laundryMachinesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await laundryMachinesService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createLaundryMachineSchema.parse(req.body);
    res.status(201).json(ok(await laundryMachinesService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateLaundryMachineSchema.parse(req.body);
    res.status(200).json(ok(await laundryMachinesService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await laundryMachinesService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
