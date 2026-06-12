import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

function isAuthEndpoint(url: string): boolean {
  return AUTH_PATHS.some((p) => url.includes(p));
}

/**
 * Attaches the access token + active branch to API requests, and transparently
 * refreshes the session once on a 401 before retrying the original request.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApi = req.url.startsWith(environment.apiUrl);

  const decorate = (request: typeof req) => {
    if (!isApi) return request;
    const token = auth.accessToken;
    const branchId = auth.activeBranchId();
    let updated = request.clone({ withCredentials: true });
    if (token) {
      updated = updated.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
    // Tag data requests with the active branch (read by the tenant middleware).
    // Las rutas públicas no llevan token ni branch (son sin sesión).
    if (
      branchId &&
      !isAuthEndpoint(request.url) &&
      !request.url.includes('/public/') &&
      !request.params.has('branchId')
    ) {
      updated = updated.clone({ setParams: { branchId } });
    }
    return updated;
  };

  return next(decorate(req)).pipe(
    catchError((err: unknown) => {
      const is401 = err instanceof HttpErrorResponse && err.status === 401;
      if (!is401 || !isApi || isAuthEndpoint(req.url)) {
        return throwError(() => err);
      }
      // Try to refresh once, then retry the original request with the new token.
      return auth.refresh().pipe(
        switchMap(() => next(decorate(req))),
        catchError(() => throwError(() => err)),
      );
    }),
  );
};
