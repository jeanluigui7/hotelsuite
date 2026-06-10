import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors';
import { fail } from '../shared/response';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Central error handler. Domain errors map to their status code; everything else
 * becomes a 500. Stack traces are never exposed in production.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: err.flatten(),
      }),
    );
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      fail({ code: err.code, message: err.message, details: err.details }),
    );
    return;
  }

  logger.error({ err }, 'Unhandled error');

  res.status(500).json(
    fail({
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      details: env.NODE_ENV === 'production' ? undefined : String(err),
    }),
  );
}

/** 404 fallback for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(fail({ code: 'NOT_FOUND', message: 'Ruta no encontrada' }));
}
