import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { reservationsService } from './reservations.service';
import { availabilityService } from './availability.service';
import { addPaymentSchema, availabilityQuerySchema, cancelReservationSchema, changeStatusSchema, createReservationSchema, updateReservationSchema } from './reservations.schema';

export const reservationsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await reservationsService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async availability(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const q = availabilityQuerySchema.parse(req.query);
    res.status(200).json(ok(await availabilityService.check(req.scope, q)));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reservationsService.getById(req.scope, req.params.id)));
  },
  async getDocument(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await reservationsService.getDocumentSnapshot(req.scope, req.params.id, req.params.docId)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createReservationSchema.parse(req.body);
    res.status(201).json(ok(await reservationsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateReservationSchema.parse(req.body);
    res.status(200).json(ok(await reservationsService.update(req.scope, req.params.id, dto)));
  },
  async addPayment(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = addPaymentSchema.parse(req.body);
    res.status(201).json(ok(await reservationsService.addPayment(req.scope, req.params.id, dto)));
  },
  async changeStatus(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = changeStatusSchema.parse(req.body);
    res.status(200).json(ok(await reservationsService.changeStatus(req.scope, req.params.id, dto)));
  },
  async cancel(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = cancelReservationSchema.parse(req.body);
    res.status(200).json(ok(await reservationsService.cancel(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await reservationsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
