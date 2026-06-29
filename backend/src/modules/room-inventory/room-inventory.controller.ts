import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { roomInventoryService } from './room-inventory.service';
import { saveInitialSchema, loadBaseSchema } from './room-inventory.schema';

export const roomInventoryController = {
  async kardex(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const q = req.query;
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    res.status(200).json(ok(await roomInventoryService.kardex(req.scope, {
      name: str(q.name), roomId: str(q.roomId), type: str(q.type), from: str(q.from), to: str(q.to),
    })));
  },
  async get(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await roomInventoryService.get(req.scope, req.params.id)));
  },
  async saveInitial(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = saveInitialSchema.parse(req.body);
    res.status(200).json(ok(await roomInventoryService.saveInitial(req.scope, req.params.id, dto)));
  },
  async loadBase(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = loadBaseSchema.parse(req.body);
    res.status(200).json(ok(await roomInventoryService.loadBase(req.scope, req.params.id, dto)));
  },
};
