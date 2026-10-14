import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { deviceAccessService } from './device-access.service';
import { updateDeviceAccessSchema } from './device-access.schema';

export const deviceAccessController = {
  async get(_req: Request, res: Response): Promise<void> {
    const data = await deviceAccessService.getForUi();
    res.status(200).json(ok(data));
  },

  async update(req: Request, res: Response): Promise<void> {
    const dto = updateDeviceAccessSchema.parse(req.body);
    const data = await deviceAccessService.save(dto.byRole);
    res.status(200).json(ok(data));
  },
};
