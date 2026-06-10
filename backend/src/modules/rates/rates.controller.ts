import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { ratesService } from './rates.service';
import {
  createCustomRateSchema,
  createRateSchema,
  updateCustomRateSchema,
  updateRateSchema,
} from './rates.schema';

function roomTypeIdFilter(req: Request): string | undefined {
  return typeof req.query.roomTypeId === 'string' ? req.query.roomTypeId : undefined;
}

export const ratesController = {
  // ── Base rates ──
  async listRates(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const items = await ratesService.listRates(req.scope, roomTypeIdFilter(req));
    res.status(200).json(ok(items));
  },
  async createRate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await ratesService.createRate(req.scope, createRateSchema.parse(req.body));
    res.status(201).json(ok(item));
  },
  async updateRate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await ratesService.updateRate(req.scope, req.params.id, updateRateSchema.parse(req.body));
    res.status(200).json(ok(item));
  },
  async removeRate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await ratesService.removeRate(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },

  // ── Custom rates ──
  async listCustomRates(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const items = await ratesService.listCustomRates(req.scope, roomTypeIdFilter(req));
    res.status(200).json(ok(items));
  },
  async createCustomRate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await ratesService.createCustomRate(req.scope, createCustomRateSchema.parse(req.body));
    res.status(201).json(ok(item));
  },
  async updateCustomRate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const item = await ratesService.updateCustomRate(
      req.scope,
      req.params.id,
      updateCustomRateSchema.parse(req.body),
    );
    res.status(200).json(ok(item));
  },
  async removeCustomRate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await ratesService.removeCustomRate(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
