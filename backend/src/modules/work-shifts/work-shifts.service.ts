import type { RequestScope } from '../../shared/context';
import { requireActiveBranch } from '../../shared/scope';
import { ConflictError } from '../../shared/errors';
import { prisma } from '../../config/prisma';
import { cashRepository } from '../cash/cash.repository';

/**
 * Turno de trabajo PERSONAL (jornada de recepción). Entidad distinta de la caja: USUARIO → TURNO → CAJA.
 * Flujo: iniciar turno → abrir caja → operar → cerrar caja (NO finaliza el turno) → finalizar turno.
 * No implementa aún tolerancia/puntualidad/tardanza (solo registra inicio/fin reales).
 */

/** Turno por hora de inicio (simple, sin config de horarios todavía). */
function shiftForHour(d: Date): 'MANANA' | 'TARDE' | 'NOCHE' {
  const h = d.getHours();
  if (h >= 6 && h < 14) return 'MANANA';
  if (h >= 14 && h < 22) return 'TARDE';
  return 'NOCHE';
}

async function activeShift(branchId: string, userId: string) {
  return prisma.workShift.findFirst({ where: { branchId, userId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
}

export const workShiftsService = {
  /** ¿El usuario tiene un turno activo? (para el bloqueo de logout, sin necesidad de sucursal activa). */
  async hasActiveByUser(userId: string) {
    return prisma.workShift.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
  },

  /**
   * Motivo por el que NO se permite el logout VOLUNTARIO (null = permitido). Aplica solo cuando el
   * usuario tiene turno activo. No afecta expiración de token / cierre de navegador (eso no llega aquí
   * con un token válido). turno+caja abierta → cerrar caja y finalizar; turno+caja cerrada → finalizar.
   */
  async logoutBlockReason(userId: string): Promise<string | null> {
    const shift = await this.hasActiveByUser(userId);
    if (!shift) return null;
    const openCaja = await cashRepository.findOpen(shift.branchId);
    return openCaja
      ? 'Debes cerrar tu caja y finalizar tu turno antes de cerrar sesión.'
      : 'Tu caja está cerrada, pero tu turno continúa activo. Finaliza tu turno antes de cerrar sesión.';
  },

  /** Estado de la Gestión de Turno del usuario: turno activo (si hay) + estado de la caja. */
  async current(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const shift = await activeShift(branchId, scope.userId);
    const openCaja = await cashRepository.findOpen(branchId);
    // ¿Ya se cerró una caja dentro de este turno? (para habilitar Finalizar turno con caja cerrada).
    const closedInShift = shift
      ? await prisma.cashSession.findFirst({ where: { branchId, workShiftId: shift.id, status: { in: ['CLOSED', 'AJUSTADA'] } } })
      : null;
    const cashState: 'NONE' | 'OPEN' | 'CLOSED' = openCaja ? 'OPEN' : (closedInShift ? 'CLOSED' : 'NONE');
    return {
      hasShift: !!shift,
      shift: shift ? { id: shift.id, shift: shift.shift, startedAt: shift.startedAt, status: shift.status } : null,
      cash: {
        state: cashState,
        openSessionId: openCaja?.id ?? null,
        openSessionNumber: openCaja?.number ?? null,
      },
      canOpenCash: !!shift && !openCaja,
      canEndShift: !!shift && !openCaja, // no se puede finalizar el turno con caja abierta
    };
  },

  /** Inicia el turno del usuario (si ya hay uno activo, lo devuelve tal cual). */
  async start(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const existing = await activeShift(branchId, scope.userId);
    if (existing) return existing;
    return prisma.workShift.create({
      data: { branchId, userId: scope.userId, shift: shiftForHour(new Date()), status: 'ACTIVE' },
    });
  },

  /** Finaliza el turno. No permitido con una caja ABIERTA. */
  async end(scope: RequestScope) {
    const branchId = requireActiveBranch(scope);
    const shift = await activeShift(branchId, scope.userId);
    if (!shift) throw new ConflictError('No tienes un turno activo.');
    const openCaja = await cashRepository.findOpen(branchId);
    if (openCaja) throw new ConflictError('Debes cerrar tu caja antes de finalizar el turno.');
    return prisma.workShift.update({ where: { id: shift.id }, data: { status: 'CLOSED', endedAt: new Date() } });
  },
};
