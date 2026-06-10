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
 */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const perm = route.data?.['permission'] as { module: string; action: string } | undefined;
  if (!perm) return true;
  if (auth.can(perm.module, perm.action)) return true;
  return router.createUrlTree(['/dashboard']);
};
