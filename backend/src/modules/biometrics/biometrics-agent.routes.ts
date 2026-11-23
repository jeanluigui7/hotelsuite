import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { ok } from '../../shared/response';
import { biometricsAgentService } from './biometrics-agent.service';
import { ingestSchema, heartbeatSchema } from './biometrics.schema';

/**
 * Rutas del AGENTE LOCAL del huellero. NO llevan authenticate()/tenant(): el agente es una máquina,
 * se autentica con el token por dispositivo enviado en el header `x-agent-token`. Se montan en /api.
 */
export const biometricsAgentRouter = Router();

function agentToken(req: Request): string {
  const h = req.header('x-agent-token') ?? '';
  return Array.isArray(h) ? h[0] : String(h);
}

biometricsAgentRouter.post(
  '/biometrics/ingest',
  asyncHandler(async (req: Request, res: Response) => {
    const dto = ingestSchema.parse(req.body);
    res.status(200).json(ok(await biometricsAgentService.ingest(dto.deviceId, agentToken(req), dto.marks)));
  }),
);

biometricsAgentRouter.post(
  '/biometrics/heartbeat',
  asyncHandler(async (req: Request, res: Response) => {
    const dto = heartbeatSchema.parse(req.body);
    res.status(200).json(ok(await biometricsAgentService.heartbeat(dto.deviceId, agentToken(req))));
  }),
);
