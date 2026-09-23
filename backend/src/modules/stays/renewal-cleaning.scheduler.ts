import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fin del día calendario (23:59:59) de la limpieza k contado desde el check-in (Día k+1). */
function cleaningDayEnd(checkInAt: Date, k: number): number {
  const ci = new Date(checkInAt);
  const d = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate(), 23, 59, 59, 999);
  d.setDate(d.getDate() + k);
  return d.getTime();
}

/**
 * Vence automáticamente las limpiezas de renovación NO SOLICITADAS: al pasar el día calendario de
 * cada limpieza (00:00 del día siguiente), si no fue solicitada ni realizada, se marca como
 * "Limpieza N no solicitada" (incrementa renewalCleaningExpired y deja registro en Auditoría/Historial).
 * Las limpiezas NO se acumulan: la siguiente se habilita en su propio día (06:30).
 */
export function startRenewalCleaningScheduler(): void {
  const tick = async (): Promise<void> => {
    try {
      const now = Date.now();
      const stays = await prisma.stay.findMany({
        where: { status: 'OPEN', renewalCleaningStatus: 'NONE' },
        select: { id: true, branchId: true, roomId: true, checkInAt: true, plannedCheckoutAt: true, renewalCleaningDone: true, renewalCleaningExpired: true },
      });
      for (const s of stays) {
        const totalNights = Math.max(1, Math.round((new Date(s.plannedCheckoutAt).getTime() - new Date(s.checkInAt).getTime()) / DAY_MS));
        const possible = Math.max(0, totalNights - 1);
        let resolved = (s.renewalCleaningDone ?? 0) + (s.renewalCleaningExpired ?? 0);
        let newlyExpired = 0;
        // Vence secuencialmente las limpiezas cuyo día ya terminó y no fueron resueltas.
        while (resolved < possible && now > cleaningDayEnd(new Date(s.checkInAt), resolved + 1)) {
          resolved++; newlyExpired++;
          const roomNum = (await prisma.room.findUnique({ where: { id: s.roomId }, select: { number: true } }))?.number ?? '?';
          await prisma.activityLog.create({
            data: {
              branchId: s.branchId, userId: null, userEmail: 'Sistema', action: 'PATCH', module: 'cleaning',
              entityId: s.id, summary: `Limpieza ${resolved} no solicitada`,
              activity: 'CLEANING', area: 'LIMPIEZA', reference: `Hab. ${roomNum}`,
              detail: `Limpieza ${resolved} no solicitada (venció su día sin solicitarse)`,
              roomId: s.roomId, metaJson: JSON.stringify({ stayId: s.id, cleaning: resolved, expired: true }),
            },
          });
        }
        if (newlyExpired > 0) {
          await prisma.stay.update({ where: { id: s.id }, data: { renewalCleaningExpired: { increment: newlyExpired } } });
        }
      }
    } catch (err) {
      logger.error({ err }, 'renewal-cleaning scheduler tick failed');
    }
  };
  // Cada 15 minutos (el vencimiento es a las 00:00, no necesita resolución de segundos).
  setInterval(() => void tick(), 15 * 60_000);
  void tick(); // primer chequeo al arrancar
  logger.info('🧹 Renewal cleaning scheduler iniciado (vence limpiezas no solicitadas)');
}
