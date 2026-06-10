import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { roomsService } from './rooms.service';
import { changeRoomStatusSchema, createRoomSchema, updateRoomSchema } from './rooms.schema';

export const roomsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await roomsService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async map(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await roomsService.map(req.scope)));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await roomsService.getEntity(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createRoomSchema.parse(req.body);
    res.status(201).json(ok(await roomsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateRoomSchema.parse(req.body);
    res.status(200).json(ok(await roomsService.update(req.scope, req.params.id, dto)));
  },
  async changeStatus(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = changeRoomStatusSchema.parse(req.body);
    res.status(200).json(ok(await roomsService.changeStatus(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await roomsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
