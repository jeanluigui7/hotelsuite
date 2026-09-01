import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { wifiService } from './wifi.service';
import { createWifiSchema, updateWifiSchema, bulkCreateWifiSchema, bulkDeleteWifiSchema, assignWifiSchema } from './wifi.schema';

export const wifiController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const showUsed = req.query.showUsed === 'true' || req.query.showUsed === '1';
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.status(200).json(ok(await wifiService.list(req.scope, { category, showUsed, search })));
  },
  async summary(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await wifiService.summary(req.scope)));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await wifiService.getById(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createWifiSchema.parse(req.body);
    res.status(201).json(ok(await wifiService.create(req.scope, dto)));
  },
  async createBulk(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = bulkCreateWifiSchema.parse(req.body);
    res.status(201).json(ok(await wifiService.createBulk(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateWifiSchema.parse(req.body);
    res.status(200).json(ok(await wifiService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await wifiService.remove(req.scope, req.params.id)));
  },
  async bulkRemove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const { ids } = bulkDeleteWifiSchema.parse(req.body);
    res.status(200).json(ok(await wifiService.bulkRemove(req.scope, ids)));
  },
  async assign(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = assignWifiSchema.parse(req.body);
    res.status(200).json(ok(await wifiService.assign(req.scope, req.params.id, dto)));
  },
};
