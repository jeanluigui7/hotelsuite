import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { healthRouter } from './modules/health/health.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // Routes (mounted under /api). New module routers are added here per phase.
  app.use('/api', healthRouter);

  // Fallbacks
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
