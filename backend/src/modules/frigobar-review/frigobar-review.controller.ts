import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { frigobarReviewService, submitReviewSchema, repositionSchema } from './frigobar-review.service';

export const frigobarReviewController = {
  async start(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await frigobarReviewService.start(req.scope, req.params.stayId)));
  },
  /** Stock actual del frigobar de una habitación (solo lectura, para la card). */
  async roomStock(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await frigobarReviewService.roomStock(req.scope, req.params.roomId)));
  },
  async submit(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await frigobarReviewService.submit(req.scope, req.params.stayId, submitReviewSchema.parse(req.body))));
  },
  async repositionStart(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await frigobarReviewService.repositionStart(req.scope, req.params.id)));
  },
  async reposition(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await frigobarReviewService.reposition(req.scope, req.params.id, repositionSchema.parse(req.body))));
  },
};
