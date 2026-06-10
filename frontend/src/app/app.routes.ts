import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';

/**
 * Rutas raíz. El ShellComponent (sidebar + topbar) envuelve todas las features.
 * Cada feature se carga de forma lazy (loadChildren) por dominio.
 */
export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes'),
      },
      {
        path: 'operations',
        loadChildren: () => import('./features/operations/operations.routes'),
      },
      {
        path: 'finance',
        loadChildren: () => import('./features/finance/finance.routes'),
      },
      {
        path: 'inventory',
        loadChildren: () => import('./features/inventory/inventory.routes'),
      },
      {
        path: 'logistics',
        loadChildren: () => import('./features/logistics/logistics.routes'),
      },
      {
        path: 'hr',
        loadChildren: () => import('./features/hr/hr.routes'),
      },
      {
        path: 'reports',
        loadChildren: () => import('./features/reports/reports.routes'),
      },
      {
        path: 'whatsapp',
        loadChildren: () => import('./features/whatsapp/whatsapp.routes'),
      },
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes'),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
