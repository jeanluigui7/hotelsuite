import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { proformasService } from './proformas.service';
import { convertProformaSchema, createProformaSchema } from './proformas.schema';

export const proformasController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await proformasService.list(req.scope)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createProformaSchema.parse(req.body);
    res.status(201).json(ok(await proformasService.create(req.scope, dto)));
  },
  async convert(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = convertProformaSchema.parse(req.body);
    res.status(200).json(ok(await proformasService.convert(req.scope, req.params.id, dto)));
  },
};
