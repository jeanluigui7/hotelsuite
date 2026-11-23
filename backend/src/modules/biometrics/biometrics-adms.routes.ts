import express, { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler';
import { biometricsAdmsService } from './biometrics-adms.service';

/**
 * Rutas del protocolo PUSH/ADMS (iclock) de ZKTeco. El equipo las llama por sí mismo (no es un usuario):
 * sin JWT, identificado por su número de serie (SN) en el query. Respuestas en TEXTO PLANO.
 * Montado bajo /api → el equipo usa la dirección "rizzoshospedaje.com/api" y Caddy lo proxya.
 */
export const biometricsAdmsRouter = Router();

// El huellero envía el cuerpo como texto (o sin content-type). Lo capturamos crudo como string.
biometricsAdmsRouter.use('/iclock', express.text({ type: () => true, limit: '4mb' }));

function snOf(req: Request): string {
  return String(req.query.SN ?? req.query.sn ?? '').trim();
}
function textOut(res: Response, body: string): void {
  res.status(200).type('text/plain').send(body);
}

// Handshake / opciones.
biometricsAdmsRouter.get('/iclock/cdata', asyncHandler(async (req: Request, res: Response) => {
  textOut(res, await biometricsAdmsService.handshake(snOf(req)));
}));

// Subida de datos (ATTLOG = marcas; el resto se ACK).
biometricsAdmsRouter.post('/iclock/cdata', asyncHandler(async (req: Request, res: Response) => {
  const table = String(req.query.table ?? '');
  const body = typeof req.body === 'string' ? req.body : '';
  textOut(res, await biometricsAdmsService.upload(snOf(req), table, body));
}));

// Sondeo de comandos (no enviamos ninguno).
biometricsAdmsRouter.get('/iclock/getrequest', asyncHandler(async (req: Request, res: Response) => {
  textOut(res, await biometricsAdmsService.getrequest(snOf(req)));
}));

// Resultados de comandos / ping / cualquier otra ruta iclock: ACK para no romper el ciclo del equipo.
biometricsAdmsRouter.post('/iclock/devicecmd', asyncHandler(async (_req: Request, res: Response) => { textOut(res, 'OK'); }));
biometricsAdmsRouter.get('/iclock/ping', asyncHandler(async (_req: Request, res: Response) => { textOut(res, 'OK'); }));
biometricsAdmsRouter.all('/iclock/*', asyncHandler(async (_req: Request, res: Response) => { textOut(res, 'OK'); }));
