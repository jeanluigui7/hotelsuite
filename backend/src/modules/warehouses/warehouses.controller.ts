import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { warehousesService } from './warehouses.service';
import { createWarehouseSchema, updateWarehouseSchema } from './warehouses.schema';

export const warehousesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await warehousesService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await warehousesService.getById(req.scope, req.params.id)));
  },
  async stock(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await warehousesService.stock(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createWarehouseSchema.parse(req.body);
    res.status(201).json(ok(await warehousesService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateWarehouseSchema.parse(req.body);
    res.status(200).json(ok(await warehousesService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await warehousesService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
