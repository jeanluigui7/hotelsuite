import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { guestsService } from './guests.service';
import { createGuestSchema, updateGuestSchema } from './guests.schema';

export const guestsController = {
  async list(req: Request, res: Response): Promise<void> {
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await guestsService.list(params);
    res.status(200).json(ok(items, meta));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const guest = await guestsService.getById(req.params.id);
    res.status(200).json(ok(guest));
  },

  async create(req: Request, res: Response): Promise<void> {
    const dto = createGuestSchema.parse(req.body);
    const guest = await guestsService.create(dto);
    res.status(201).json(ok(guest));
  },

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateGuestSchema.parse(req.body);
    const guest = await guestsService.update(req.params.id, dto);
    res.status(200).json(ok(guest));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await guestsService.remove(req.params.id);
    res.status(200).json(ok({ success: true }));
  },
};
