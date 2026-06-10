import type { RequestScope } from './context';
import { ValidationError } from './errors';

/**
 * Returns the active branch id or throws if none is selected.
 * Used by branch-scoped catalog services to anchor reads/writes to one branch.
 */
export function requireActiveBranch(scope: RequestScope): string {
  if (!scope.activeBranchId) {
    throw new ValidationError('Seleccione una sucursal para esta operación');
  }
  return scope.activeBranchId;
}
