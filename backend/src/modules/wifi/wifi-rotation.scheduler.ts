import { logger } from '../../config/logger';
import { wifiService } from './wifi.service';

/**
 * Rotación diaria del voucher WiFi para estadías de PERNOCTACIÓN multi-día: al pasar el corte del día
 * hotelero, se consume el cupón vigente y se asigna uno nuevo (un cupón por día). Se revisa cada 15 min
 * (el corte es idempotente: una vez rotado, el voucher es "de este día" y no se vuelve a rotar hasta el
 * siguiente corte). Best-effort: si el pool está vacío, conserva el voucher.
 */
export function startWifiRotationScheduler(): void {
  const tick = async (): Promise<void> => {
    try {
      const { rotated } = await wifiService.rotateOvernightVouchers();
      if (rotated > 0) logger.info({ rotated }, '📶 Rotación WiFi de pernoctación');
    } catch (err) {
      logger.error({ err }, 'wifi rotation scheduler tick failed');
    }
  };
  setInterval(() => void tick(), 15 * 60_000);
  logger.info('📶 WiFi rotation scheduler iniciado (rotación diaria de pernoctación)');
}
