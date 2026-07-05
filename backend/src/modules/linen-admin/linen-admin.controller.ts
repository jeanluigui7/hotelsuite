import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { linenAdminService, transferSchema, replenishSchema, createItemSchema, updateItemSchema } from './linen-admin.service';

export const linenAdminController = {
  async requests(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.requests(req.scope)));
  },
  async fulfill(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.fulfill(req.scope, req.params.id)));
  },
  async reject(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.reject(req.scope, req.params.id)));
  },
  async transfer(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = transferSchema.parse(req.body);
    res.status(201).json(ok(await linenAdminService.transfer(req.scope, dto)));
  },
  async central(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.central(req.scope)));
  },
  async warehouse(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.warehouse(req.scope)));
  },
  async createItem(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await linenAdminService.createItem(req.scope, createItemSchema.parse(req.body))));
  },
  async updateItem(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.updateItem(req.scope, req.params.id, updateItemSchema.parse(req.body))));
  },
  async deactivateItem(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await linenAdminService.deactivateItem(req.scope, req.params.id)));
  },
  async replenish(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = replenishSchema.parse(req.body);
    res.status(201).json(ok(await linenAdminService.replenish(req.scope, dto)));
  },
};
