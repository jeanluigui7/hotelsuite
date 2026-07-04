import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { receptionInventoryService, requestSchema, writeOffSchema } from './reception-inventory.service';

export const receptionInventoryController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const shift = typeof req.query.shift === 'string' ? req.query.shift : undefined;
    res.status(200).json(ok(await receptionInventoryService.list(req.scope, { date, shift })));
  },
  async createRequest(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = requestSchema.parse(req.body);
    res.status(201).json(ok(await receptionInventoryService.createRequest(req.scope, dto)));
  },
  async listRequests(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.status(200).json(ok(await receptionInventoryService.listRequests(req.scope, status)));
  },
  async sendRequest(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await receptionInventoryService.sendRequest(req.scope, req.params.id)));
  },
  async receiveRequest(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await receptionInventoryService.receiveRequest(req.scope, req.params.id)));
  },
  async writeOff(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = writeOffSchema.parse(req.body);
    res.status(201).json(ok(await receptionInventoryService.writeOff(req.scope, dto)));
  },
  async printQueue(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await receptionInventoryService.printQueue(req.scope)));
  },
  async markPrinted(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await receptionInventoryService.markPrinted(req.scope, req.params.id)));
  },
};
