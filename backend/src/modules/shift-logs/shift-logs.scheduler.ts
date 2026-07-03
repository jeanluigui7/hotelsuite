import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { shiftLogsService } from './shift-logs.service';

const GRACE_MIN = 3; // ventana tras la hora de salida para disparar el corte
const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const isoDay = (d: Date): number => (d.getDay() === 0 ? 7 : d.getDay());

/**
 * Revisa cada minuto los horarios por rol y, al llegar la hora de salida de un
 * turno (en día laboral), graba automáticamente el corte si no se hizo manual.
 */
export function startShiftScheduler(): void {
  const tick = async (): Promise<void> => {
    try {
      const shifts = await prisma.roleShift.findMany({ where: { status: 'active' } });
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      for (const s of shifts) {
        const endMin = toMin(s.endTime);
        const diff = (nowMin - endMin + 1440) % 1440;
        if (diff > GRACE_MIN) continue;
        const overnight = toMin(s.endTime) <= toMin(s.startTime);
        const anchorDay = overnight ? (isoDay(now) === 1 ? 7 : isoDay(now) - 1) : isoDay(now);
        const days = s.daysOfWeek ? s.daysOfWeek.split(',').map(Number) : [];
        if (days.length && !days.includes(anchorDay)) continue;
        await shiftLogsService.recordCut({ branchId: s.branchId, role: s.role, shift: s.shift, cutAt: now, auto: true });
      }
    } catch (err) {
      logger.error({ err }, 'shift scheduler tick failed');
    }
  };
  // Primer tick al minuto siguiente; luego cada minuto.
  setInterval(() => void tick(), 60_000);
  logger.info('🕒 Shift scheduler iniciado (corte automático de turnos)');
}
