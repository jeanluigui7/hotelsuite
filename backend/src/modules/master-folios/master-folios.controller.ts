import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { masterFoliosService } from './master-folios.service';
import { addStaySchema, createMasterFolioSchema, invoiceMasterSchema, updateMasterFolioSchema } from './master-folios.schema';

export const masterFoliosController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await masterFoliosService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async detail(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await masterFoliosService.detail(req.scope, req.params.id)));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createMasterFolioSchema.parse(req.body);
    res.status(201).json(ok(await masterFoliosService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateMasterFolioSchema.parse(req.body);
    res.status(200).json(ok(await masterFoliosService.update(req.scope, req.params.id, dto)));
  },
  async addStay(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = addStaySchema.parse(req.body);
    res.status(200).json(ok(await masterFoliosService.addStay(req.scope, req.params.id, dto.stayId)));
  },
  async removeStay(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await masterFoliosService.removeStay(req.scope, req.params.id, req.params.stayId)));
  },
  async billable(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await masterFoliosService.billable(req.scope, req.params.id)));
  },
  async invoice(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = invoiceMasterSchema.parse(req.body);
    res.status(201).json(ok(await masterFoliosService.invoice(req.scope, req.params.id, dto)));
  },
};
