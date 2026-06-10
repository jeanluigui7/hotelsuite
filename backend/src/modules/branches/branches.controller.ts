import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { branchesService } from './branches.service';
import { createBranchSchema, updateBranchSchema } from './branches.schema';

export const branchesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await branchesService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const branch = await branchesService.getById(req.params.id);
    res.status(200).json(ok(branch));
  },

  async create(req: Request, res: Response): Promise<void> {
    const dto = createBranchSchema.parse(req.body);
    const branch = await branchesService.create(dto);
    res.status(201).json(ok(branch));
  },

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateBranchSchema.parse(req.body);
    const branch = await branchesService.update(req.params.id, dto);
    res.status(200).json(ok(branch));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await branchesService.remove(req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
