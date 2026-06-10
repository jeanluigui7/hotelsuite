import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';
import { authGuard, permissionGuard } from './core/auth/auth.guard';

/**
 * Rutas raíz. /login es pública; el resto vive bajo el ShellComponent y exige sesión.
 * Cada feature se carga de forma lazy (loadChildren) por dominio y, donde aplica,
 * se protege por permiso (module × action).
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes'),
      },
      {
        path: 'operations',
        canActivate: [permissionGuard],
        data: { permission: { module: 'operations', action: 'view' } },
        loadChildren: () => import('./features/operations/operations.routes'),
      },
      {
        path: 'finance',
        canActivate: [permissionGuard],
        data: { permission: { module: 'finance', action: 'view' } },
        loadChildren: () => import('./features/finance/finance.routes'),
      },
      {
        path: 'inventory',
        canActivate: [permissionGuard],
        data: { permission: { module: 'inventory', action: 'view' } },
        loadChildren: () => import('./features/inventory/inventory.routes'),
      },
      {
        path: 'logistics',
        canActivate: [permissionGuard],
        data: { permission: { module: 'logistics', action: 'view' } },
        loadChildren: () => import('./features/logistics/logistics.routes'),
      },
      {
        path: 'hr',
        canActivate: [permissionGuard],
        data: { permission: { module: 'hr', action: 'view' } },
        loadChildren: () => import('./features/hr/hr.routes'),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permission: { module: 'reports', action: 'view' } },
        loadChildren: () => import('./features/reports/reports.routes'),
      },
      {
        path: 'whatsapp',
        canActivate: [permissionGuard],
        data: { permission: { module: 'whatsapp', action: 'view' } },
        loadChildren: () => import('./features/whatsapp/whatsapp.routes'),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permission: { module: 'settings', action: 'view' } },
        loadChildren: () => import('./features/settings/settings.routes'),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
