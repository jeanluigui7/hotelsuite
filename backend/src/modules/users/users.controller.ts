import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { usersService } from './users.service';
import { createUserSchema, updateUserSchema } from './users.schema';

export const usersController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await usersService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const user = await usersService.getById(req.params.id);
    res.status(200).json(ok(user));
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createUserSchema.parse(req.body);
    const user = await usersService.create(req.scope, dto);
    res.status(201).json(ok(user));
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateUserSchema.parse(req.body);
    const user = await usersService.update(req.scope, req.params.id, dto);
    res.status(200).json(ok(user));
  },

  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await usersService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
