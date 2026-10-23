import { prisma } from '../config/prisma';
import { ConflictError } from './errors';
import type { RequestScope } from './context';

/** El usuario pertenece al perfil de Limpieza (por nombre de rol). */
export function isCleaningRole(scope: RequestScope): boolean {
  return (scope.roleName ?? '').toLowerCase().includes('limpieza');
}

/**
 * Exige un turno de limpieza ABIERTO (CleaningShift OPEN) para operar.
 * Login = solo ver; para ejecutar acciones hay que iniciar turno. El Super Admin siempre pasa.
 */
export async function requireOpenCleaningShift(scope: RequestScope): Promise<void> {
  if (scope.isSuperAdmin) return;
  const branchId = scope.activeBranchId;
  const shift = branchId
    ? await prisma.cleaningShift.findFirst({ where: { branchId, userId: scope.userId, status: 'OPEN' } })
    : null;
  if (!shift) {
    throw new ConflictError('Inicia tu turno de limpieza para realizar esta acción.');
  }
}

/**
 * Para endpoints COMPARTIDOS con Recepción (reportar falla, entregar adicionales, reponer frigobar):
 * solo exige turno de limpieza si quien opera es de perfil Limpieza. Recepción/Admin no se ven afectados.
 */
export async function requireCleaningShiftIfCleaner(scope: RequestScope): Promise<void> {
  if (isCleaningRole(scope)) await requireOpenCleaningShift(scope);
}
