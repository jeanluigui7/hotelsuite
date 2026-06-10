import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { rolesService } from './roles.service';
import { createRoleSchema, updateRoleSchema } from './roles.schema';

export const rolesController = {
  async list(req: Request, res: Response): Promise<void> {
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await rolesService.list(params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const role = await rolesService.getById(req.params.id);
    res.status(200).json(ok(role));
  },

  async create(req: Request, res: Response): Promise<void> {
    const dto = createRoleSchema.parse(req.body);
    const role = await rolesService.create(dto);
    res.status(201).json(ok(role));
  },

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateRoleSchema.parse(req.body);
    const role = await rolesService.update(req.params.id, dto);
    res.status(200).json(ok(role));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await rolesService.remove(req.params.id);
    res.status(200).json(ok({ success: true }));
  },

  async permissions(_req: Request, res: Response): Promise<void> {
    const perms = await rolesService.listPermissions();
    res.status(200).json(ok(perms));
  },
};
