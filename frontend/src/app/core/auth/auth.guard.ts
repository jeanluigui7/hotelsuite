import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Blocks access to protected routes unless a session is active. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

/**
 * Guards a route by required permission. Configure via route data:
 *   data: { permission: { module: 'hr', action: 'view' } }
 * or, to allow access with ANY of several permissions (ej. recepción u administración):
 *   data: { anyOf: [{ module: 'operations', action: 'view' }, { module: 'settings', action: 'view' }] }
 */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const anyOf = route.data?.['anyOf'] as { module: string; action: string }[] | undefined;
  if (anyOf?.length) {
    if (anyOf.some((p) => auth.can(p.module, p.action))) return true;
    return router.createUrlTree(['/dashboard']);
  }
  const perm = route.data?.['permission'] as { module: string; action: string } | undefined;
  if (!perm) return true;
  if (auth.can(perm.module, perm.action)) return true;
  return router.createUrlTree(['/dashboard']);
};
