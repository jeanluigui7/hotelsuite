import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { cleaningService, startSchema, requestLinenSchema, laundrySchema, revisionSchema } from './cleaning.service';

export const cleaningController = {
  async linenItems(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.linenItems(req.scope)));
  },
  async roomsToClean(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.roomsToClean(req.scope)));
  },
  async start(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = startSchema.parse(req.body);
    res.status(201).json(ok(await cleaningService.start(req.scope, req.params.roomId, dto)));
  },
  async finish(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.finish(req.scope, req.params.roomId)));
  },
  async linenInventory(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.linenInventory(req.scope)));
  },
  async requestLinen(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = requestLinenSchema.parse(req.body);
    res.status(201).json(ok(await cleaningService.requestLinen(req.scope, dto)));
  },
  async sendToLaundry(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = laundrySchema.parse(req.body);
    res.status(201).json(ok(await cleaningService.sendToLaundry(req.scope, dto)));
  },
  async shift(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.shift(req.scope)));
  },
  async openShift(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await cleaningService.openShift(req.scope)));
  },
  async markLaundrySent(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.markLaundrySent(req.scope)));
  },
  async closeShift(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.closeShift(req.scope)));
  },
  async turnoReport(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.turnoReport(req.scope)));
  },
  async revisionPeriodica(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = revisionSchema.parse(req.body);
    res.status(201).json(ok(await cleaningService.revisionPeriodica(req.scope, dto)));
  },
  async revisions(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
    res.status(200).json(ok(await cleaningService.revisions(req.scope, roomId)));
  },
  async maintenanceRevisions(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await cleaningService.maintenanceRevisions(req.scope)));
  },
};
