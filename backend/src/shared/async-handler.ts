import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async controller so thrown errors are forwarded to the central errorHandler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
