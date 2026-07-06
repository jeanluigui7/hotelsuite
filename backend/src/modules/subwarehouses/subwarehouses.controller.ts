import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { subWarehousesService } from './subwarehouses.service';
import { createSubWarehouseSchema, updateSubWarehouseSchema, setRoomsSchema, setStockSchema, supplySchema } from './subwarehouses.schema';

export const subWarehousesController = {
  async linenArea(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.linenArea(req.scope)));
  },
  async roomAssignment(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
    if (!roomId) throw new ValidationError('roomId es requerido');
    res.status(200).json(ok(await subWarehousesService.roomAssignment(req.scope, roomId)));
  },
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
    if (!areaId) throw new ValidationError('areaId es requerido');
    res.status(200).json(ok(await subWarehousesService.list(req.scope, areaId)));
  },
  async coverageRooms(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
    if (!areaId) throw new ValidationError('areaId es requerido');
    res.status(200).json(ok(await subWarehousesService.coverageRooms(req.scope, areaId)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await subWarehousesService.create(req.scope, createSubWarehouseSchema.parse(req.body))));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.update(req.scope, req.params.id, updateSubWarehouseSchema.parse(req.body))));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await subWarehousesService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
  async setRooms(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.setRooms(req.scope, req.params.id, setRoomsSchema.parse(req.body))));
  },
  async getStock(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.getStock(req.scope, req.params.id)));
  },
  async needs(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.needs(req.scope, req.params.id)));
  },
  async setStock(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.setStock(req.scope, req.params.id, setStockSchema.parse(req.body))));
  },
  async supply(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await subWarehousesService.supply(req.scope, req.params.id, supplySchema.parse(req.body))));
  },
};
