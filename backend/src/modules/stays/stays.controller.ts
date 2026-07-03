import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { staysService } from './stays.service';
import { changeRoomSchema, checkInSchema, checkOutSchema, renewSchema, updateStayDetailsSchema } from './stays.schema';

export const staysController = {
  async checkIn(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = checkInSchema.parse(req.body);
    res.status(201).json(ok(await staysService.checkIn(req.scope, dto)));
  },

  async checkOut(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = checkOutSchema.parse(req.body);
    res.status(200).json(ok(await staysService.checkOut(req.scope, req.params.id, dto)));
  },

  async folio(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await staysService.folio(req.scope, req.params.id)));
  },

  async updateDetails(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateStayDetailsSchema.parse(req.body);
    res.status(200).json(ok(await staysService.updateDetails(req.scope, req.params.id, dto)));
  },

  async renew(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = renewSchema.parse(req.body ?? {});
    res.status(200).json(ok(await staysService.renew(req.scope, req.params.id, dto)));
  },

  async renewalCleaning(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const action = req.params.action as 'start' | 'finish' | 'reject';
    res.status(200).json(ok(await staysService.renewalCleaning(req.scope, req.params.id, action)));
  },

  async changeRoom(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = changeRoomSchema.parse(req.body);
    res.status(200).json(ok(await staysService.changeRoom(req.scope, req.params.id, dto)));
  },

  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await staysService.getById(req.scope, req.params.id)));
  },

  async checkoutSummary(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await staysService.checkoutSummary(req.scope, req.params.id)));
  },

  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
    const { items, meta } = await staysService.list(req.scope, params, { status, roomId });
    res.status(200).json(ok(items, meta));
  },
};
