import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { roomTypesService } from './room-types.service';
import { createRoomTypeSchema, updateRoomTypeSchema } from './room-types.schema';

export const roomTypesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await roomTypesService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await roomTypesService.getById(req.scope, req.params.id);
    res.status(200).json(ok(item));
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createRoomTypeSchema.parse(req.body);
    const item = await roomTypesService.create(req.scope, dto);
    res.status(201).json(ok(item));
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateRoomTypeSchema.parse(req.body);
    const item = await roomTypesService.update(req.scope, req.params.id, dto);
    res.status(200).json(ok(item));
  },

  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await roomTypesService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
