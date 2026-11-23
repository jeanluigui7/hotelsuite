import type { Request, Response } from 'express';
import { ok } from '../../shared/response';
import { paginationSchema } from '../../shared/pagination';
import { UnauthorizedError } from '../../shared/errors';
import { biometricsService } from './biometrics.service';
import { biometricsAgentService } from './biometrics-agent.service';
import { biometricsAdmsService } from './biometrics-adms.service';
import { bindSerialSchema, createDeviceSchema, enrollSchema, updateDeviceSchema } from './biometrics.schema';

export const biometricsController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const params = paginationSchema.parse(req.query);
    const { items, meta } = await biometricsService.list(req.scope, params);
    res.status(200).json(ok(items, meta));
  },
  async create(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = createDeviceSchema.parse(req.body);
    res.status(201).json(ok(await biometricsService.create(req.scope, dto)));
  },
  async update(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = updateDeviceSchema.parse(req.body);
    res.status(200).json(ok(await biometricsService.update(req.scope, req.params.id, dto)));
  },
  async remove(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await biometricsService.remove(req.scope, req.params.id);
    res.status(200).json(ok({ success: true }));
  },
  async test(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsService.test(req.scope, req.params.id)));
  },
  async connect(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsService.connect(req.scope, req.params.id)));
  },
  async disconnect(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsService.disconnect(req.scope, req.params.id)));
  },
  async enrollments(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsService.enrollments(req.scope, req.params.id)));
  },
  async enroll(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = enrollSchema.parse(req.body);
    res.status(201).json(ok(await biometricsService.enroll(req.scope, req.params.id, dto)));
  },
  async removeEnrollment(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    await biometricsService.removeEnrollment(req.scope, req.params.id, req.params.enrollmentId);
    res.status(200).json(ok({ success: true }));
  },
  /** Genera/rota el token del agente local (se muestra UNA sola vez). */
  async generateAgentToken(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsAgentService.generateToken(req.scope, req.params.id)));
  },
  /** Estado del agente local (si hay token y la última señal). */
  async agentStatus(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsAgentService.agentStatus(req.scope, req.params.id)));
  },
  /** Estado ADMS/nube (SN vinculado, última señal, dirección del servidor, SN detectado). */
  async admsStatus(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    res.status(200).json(ok(await biometricsAdmsService.status(req.scope, req.params.id)));
  },
  /** Vincula un número de serie (ADMS) al dispositivo. */
  async bindSerial(req: Request, res: Response): Promise<void> {
    if (!req.scope) throw new UnauthorizedError();
    const dto = bindSerialSchema.parse(req.body);
    res.status(200).json(ok(await biometricsAdmsService.bindSerial(req.scope, req.params.id, dto.serial)));
  },
};
