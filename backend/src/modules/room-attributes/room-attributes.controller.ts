import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { roomAttributesService } from './room-attributes.service';
import { createRoomAttributeSchema, updateRoomAttributeSchema } from './room-attributes.schema';

export const roomAttributesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await roomAttributesService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await roomAttributesService.getById(req.scope, req.params.id);
    res.status(200).json(ok(item));
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createRoomAttributeSchema.parse(req.body);
    const item = await roomAttributesService.create(req.scope, dto);
    res.status(201).json(ok(item));
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateRoomAttributeSchema.parse(req.body);
    const item = await roomAttributesService.update(req.scope, req.params.id, dto);
    res.status(200).json(ok(item));
  },

  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await roomAttributesService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
