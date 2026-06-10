import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();

const server = app.listen(env.BACKEND_PORT, () => {
  logger.info(`🚀 HotelSuite backend listening on http://localhost:${env.BACKEND_PORT}`);
  logger.info(`   Health: http://localhost:${env.BACKEND_PORT}/api/health`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
