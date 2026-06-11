import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { MessageService, ConfirmationService } from 'primeng/api';
import Aura from '@primeng/themes/aura';
import { catchError, firstValueFrom, of, switchMap } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';

/** Restores the session from the refresh cookie (if any) before the app starts. */
function restoreSession(auth: AuthService) {
  return () =>
    firstValueFrom(
      auth.refresh().pipe(
        switchMap(() => auth.loadBranches()),
        catchError(() => of(null)),
      ),
    );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
          cssLayer: false,
        },
      },
      // Los overlays (selects, dropdowns, datepickers) se montan en <body> para que
      // no los recorte/oculte el contenedor con scroll y se reposicionen al hacer scroll.
      overlayOptions: {
        appendTo: 'body',
      },
    }),
    MessageService,
    ConfirmationService,
    {
      provide: APP_INITIALIZER,
      useFactory: restoreSession,
      deps: [AuthService],
      multi: true,
    },
  ],
};
