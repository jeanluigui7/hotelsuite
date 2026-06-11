import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { remindersService } from './reminders.service';
import { createReminderSchema, updateReminderSchema } from './reminders.schema';

export const remindersController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await remindersService.list(req.scope)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await remindersService.create(req.scope, createReminderSchema.parse(req.body))));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await remindersService.update(req.scope, req.params.id, updateReminderSchema.parse(req.body))));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await remindersService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
