import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { faultTypesService } from './fault-types.service';
import { createFaultTypeSchema, updateFaultTypeSchema } from './fault-types.schema';

export const faultTypesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
    const { items, meta } = await faultTypesService.list(params, status, severity);
    res.status(200).json(ok(items, meta));
  },

  async catalog(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const includeInactive = req.query.all === 'true';
    const tree = await faultTypesService.catalog(!includeInactive);
    res.status(200).json(ok(tree));
  },

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await faultTypesService.getById(req.params.id);
    res.status(200).json(ok(item));
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createFaultTypeSchema.parse(req.body);
    const item = await faultTypesService.create(dto);
    res.status(201).json(ok(item));
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateFaultTypeSchema.parse(req.body);
    const item = await faultTypesService.update(req.params.id, dto);
    res.status(200).json(ok(item));
  },

  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await faultTypesService.remove(req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
