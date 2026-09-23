import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startShiftScheduler } from './modules/shift-logs/shift-logs.scheduler';
import { startWifiRotationScheduler } from './modules/wifi/wifi-rotation.scheduler';
import { startRenewalCleaningScheduler } from './modules/stays/renewal-cleaning.scheduler';

const app = createApp();

const server = app.listen(env.BACKEND_PORT, () => {
  logger.info(`🚀 HotelSuite backend listening on http://localhost:${env.BACKEND_PORT}`);
  logger.info(`   Health: http://localhost:${env.BACKEND_PORT}/api/health`);
  startShiftScheduler();
  startWifiRotationScheduler();
  startRenewalCleaningScheduler();
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
