import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import type { RequestScope } from '../../shared/context';

/** Áreas operativas de la bitácora de auditoría. */
export type ActivityArea =
  | 'HOSPEDAJE' | 'VENTAS' | 'CAJA' | 'INVENTARIO' | 'LIMPIEZA' | 'INSPECCION'
  | 'RESERVAS' | 'WIFI' | 'FRIGOBAR' | 'MANTENIMIENTO' | 'USUARIOS' | 'PERMISOS'
  | 'AUTORIZACIONES' | 'PRECIOS' | 'SESION' | 'TURNO' | 'COMPROBANTES' | 'OBSERVACIONES';

export interface RecordActivityInput {
  activity: string; // código del evento (CHECK_IN, SALE, CASH_IN, …)
  area: ActivityArea;
  detail: string; // texto legible para el auditor (sin datos técnicos)
  reference?: string | null; // "Hab. 208", "Venta #1854", "Caja #3", …
  roomId?: string | null;
  entityId?: string | null; // id de la operación relacionada (saleId/stayId/sessionId)
  authorizedByUserId?: string | null;
  shift?: string | null; // override; por defecto = turno operativo activo
  meta?: Record<string, unknown> | null; // detalle estructurado para el desplegable ▼
  branchId?: string | null; // override; por defecto = scope.activeBranchId
  userId?: string | null; // override; por defecto = scope.userId
}

/** Turno operativo del usuario al momento (WorkShift ACTIVE); sin turno abierto → FUERA_DE_TURNO. */
async function resolveShift(branchId: string | null, userId: string | null): Promise<string> {
  if (!branchId || !userId) return 'FUERA_DE_TURNO';
  const ws = await prisma.workShift.findFirst({
    where: { branchId, userId, status: 'ACTIVE' },
    orderBy: { startedAt: 'desc' },
    select: { shift: true },
  });
  return ws?.shift ?? 'FUERA_DE_TURNO';
}

/**
 * Registra un evento de dominio en la bitácora de auditoría (ActivityLog). Es **fire-and-forget**:
 * nunca lanza ni bloquea la operación de negocio (si falla el log, deja un warn). El histórico es
 * inmutable: una corrección genera un NUEVO evento, nunca sobrescribe el anterior.
 *
 * Uso recomendado en los servicios: `void recordActivity(scope, { ... });` tras completar la acción.
 */
export async function recordActivity(scope: RequestScope, input: RecordActivityInput): Promise<void> {
  try {
    const branchId = input.branchId !== undefined ? input.branchId : scope.activeBranchId;
    const userId = input.userId !== undefined ? input.userId : scope.userId;
    const shift = input.shift ?? (await resolveShift(branchId, userId));
    await prisma.activityLog.create({
      data: {
        branchId,
        userId,
        userEmail: null, // el nombre se resuelve en la lectura
        action: 'EVENT',
        module: input.area.toLowerCase(),
        entityId: input.entityId ?? null,
        summary: input.detail, // compatibilidad con el campo legacy (no nulo)
        activity: input.activity,
        area: input.area,
        reference: input.reference ?? null,
        detail: input.detail,
        shift,
        roomId: input.roomId ?? null,
        authorizedByUserId: input.authorizedByUserId ?? null,
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'activity log failed');
  }
}
