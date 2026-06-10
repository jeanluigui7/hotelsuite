import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { checklistService } from './checklist.service';
import { createChecklistItemSchema, updateChecklistItemSchema } from './checklist.schema';

export const checklistController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await checklistService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createChecklistItemSchema.parse(req.body);
    res.status(201).json(ok(await checklistService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateChecklistItemSchema.parse(req.body);
    res.status(200).json(ok(await checklistService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await checklistService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
