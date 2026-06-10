import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { clientTiersService } from './client-tiers.service';
import { createClientTierSchema, updateClientTierSchema } from './client-tiers.schema';

export const clientTiersController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await clientTiersService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await clientTiersService.getById(req.scope, req.params.id);
    res.status(200).json(ok(item));
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createClientTierSchema.parse(req.body);
    const item = await clientTiersService.create(req.scope, dto);
    res.status(201).json(ok(item));
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateClientTierSchema.parse(req.body);
    const item = await clientTiersService.update(req.scope, req.params.id, dto);
    res.status(200).json(ok(item));
  },

  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await clientTiersService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
