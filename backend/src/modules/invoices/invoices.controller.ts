import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { invoicesService } from './invoices.service';
import { issueInvoiceSchema } from './invoices.schema';

export const invoicesController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await invoicesService.list(req.scope, params, { type, status });
    res.status(200).json(ok(items, meta));
  },
  async getById(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await invoicesService.getById(req.scope, req.params.id)));
  },
  async issue(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = issueInvoiceSchema.parse(req.body);
    res.status(201).json(ok(await invoicesService.issue(req.scope, dto)));
  },
  async void(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await invoicesService.void(req.scope, req.params.id)));
  },
};
