import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { healthRouter } from './modules/health/health.routes';
import { authRouter } from './modules/auth/auth.routes';
import { branchesRouter } from './modules/branches/branches.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { usersRouter } from './modules/users/users.routes';
import { roomAttributesRouter } from './modules/room-attributes/room-attributes.routes';
import { roomTypesRouter } from './modules/room-types/room-types.routes';
import { clientTiersRouter } from './modules/client-tiers/client-tiers.routes';
import { guestsRouter } from './modules/guests/guests.routes';
import { ratesRouter } from './modules/rates/rates.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  // Routes (mounted under /api). New module routers are added here per phase.
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', branchesRouter);
  app.use('/api', rolesRouter);
  app.use('/api', usersRouter);
  app.use('/api', roomAttributesRouter);
  app.use('/api', roomTypesRouter);
  app.use('/api', clientTiersRouter);
  app.use('/api', guestsRouter);
  app.use('/api', ratesRouter);

  // Fallbacks
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
