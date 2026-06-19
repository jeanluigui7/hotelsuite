import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { UnauthorizedError } from '../../shared/errors';
import { whatsappService } from './whatsapp.service';
import {
  createInstanceSchema,
  createTemplateSchema,
  notifyConfigSchema,
  sendSchema,
  updateInstanceSchema,
  updateTemplateSchema,
} from './whatsapp.schema';

export const whatsappController = {
  // Instances
  async listInstances(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.listInstances(req.scope)));
  },
  async createInstance(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await whatsappService.createInstance(req.scope, createInstanceSchema.parse(req.body))));
  },
  async updateInstance(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.updateInstance(req.scope, req.params.id, updateInstanceSchema.parse(req.body))));
  },
  async toggleInstance(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.toggleInstance(req.scope, req.params.id)));
  },
  async removeInstance(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await whatsappService.removeInstance(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },

  // Templates
  async listTemplates(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.listTemplates(req.scope)));
  },
  async createTemplate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await whatsappService.createTemplate(req.scope, createTemplateSchema.parse(req.body))));
  },
  async updateTemplate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.updateTemplate(req.scope, req.params.id, updateTemplateSchema.parse(req.body))));
  },
  async removeTemplate(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await whatsappService.removeTemplate(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },

  // Send / Logs
  async send(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(201).json(ok(await whatsappService.send(req.scope, sendSchema.parse(req.body))));
  },
  async listLogs(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.listLogs(req.scope)));
  },

  // Notify config
  async getNotifyConfig(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await whatsappService.getNotifyConfig(req.scope)));
  },
  async setNotifyConfig(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = notifyConfigSchema.parse(req.body);
    res.status(200).json(ok(await whatsappService.setNotifyConfig(req.scope, dto.adminPhone)));
  },
};
