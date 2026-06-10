import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/response';
import { printingService } from './printing.service';

const signSchema = z.object({ request: z.string().min(1) });

export const printingController = {
  /** Returns the public certificate (and whether QZ is configured). */
  certificate(_req: Request, res: Response): void {
    res.status(200).json(
      ok({ configured: printingService.isConfigured(), certificate: printingService.getCertificate() }),
    );
  },

  /** Signs a QZ Tray request payload with the server's private key. */
  sign(req: Request, res: Response): void {
    const { request } = signSchema.parse(req.body);
    res.status(200).json(ok({ signature: printingService.sign(request) }));
  },
};
