import type { Request, Response } from 'express';
import { ok } from '../../shared/response';

/**
 * Liveness probe. No DB access — must succeed even before the database exists.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json(
    ok({
      status: 'ok',
      service: 'hotelsuite-backend',
      uptime: process.uptime(),
    }),
  );
}
