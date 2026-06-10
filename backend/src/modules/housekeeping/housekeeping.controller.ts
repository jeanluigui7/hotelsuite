import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { housekeepingService } from './housekeeping.service';
import { completeTaskSchema, createTaskSchema, inspectTaskSchema } from './housekeeping.schema';

export const housekeepingController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, meta } = await housekeepingService.list(req.scope, params, status);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createTaskSchema.parse(req.body);
    res.status(201).json(ok(await housekeepingService.create(req.scope, dto)));
  },
  async start(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await housekeepingService.start(req.scope, req.params.id)));
  },
  async complete(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = completeTaskSchema.parse(req.body);
    res.status(200).json(ok(await housekeepingService.complete(req.scope, req.params.id, dto)));
  },
  async inspect(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = inspectTaskSchema.parse(req.body);
    res.status(200).json(ok(await housekeepingService.inspect(req.scope, req.params.id, dto)));
  },
};
