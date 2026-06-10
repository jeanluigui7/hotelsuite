import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Endpoints too noisy or pre-auth to audit.
const SKIP = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/printing/sign'];

/**
 * Logs every successful write (POST/PUT/PATCH/DELETE) to ActivityLog after the
 * response finishes (req.user/req.scope are populated by then). Fire-and-forget.
 */
export function auditLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      if (!WRITE_METHODS.has(req.method)) return;
      if (res.statusCode >= 400) return;
      if (!req.originalUrl.startsWith('/api/')) return;
      if (SKIP.some((p) => req.originalUrl.startsWith(p))) return;

      const path = req.originalUrl.split('?')[0].replace('/api/', '');
      const moduleName = path.split('/')[0] || 'api';
      const entityId = typeof req.params.id === 'string' ? req.params.id : null;

      prisma.activityLog
        .create({
          data: {
            branchId: req.scope?.activeBranchId ?? null,
            userId: req.user?.userId ?? null,
            userEmail: req.user?.email ?? null,
            action: req.method,
            module: moduleName,
            entityId,
            summary: `${req.method} ${path}`,
          },
        })
        .catch((err) => logger.warn({ err }, 'audit log failed'));
    });
    next();
  };
}
