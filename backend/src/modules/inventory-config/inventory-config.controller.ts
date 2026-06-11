import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { inventoryConfigService, updateInventoryConfigSchema } from './inventory-config.service';

export const inventoryConfigController = {
  async get(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await inventoryConfigService.get(req.scope)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateInventoryConfigSchema.parse(req.body);
    res.status(200).json(ok(await inventoryConfigService.update(req.scope, dto)));
  },
};
