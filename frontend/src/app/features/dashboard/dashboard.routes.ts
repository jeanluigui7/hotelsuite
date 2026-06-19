import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
  },
  {
    path: 'recepcion',
    loadComponent: () => import('./recepcion/recepcion-summary.component').then((m) => m.RecepcionSummaryComponent),
  },
  {
    path: 'limpieza',
    loadComponent: () => import('./limpieza/limpieza-summary.component').then((m) => m.LimpiezaSummaryComponent),
  },
  {
    path: 'caja',
    loadComponent: () => import('./caja/caja-summary.component').then((m) => m.CajaSummaryComponent),
  },
  {
    path: 'turno',
    loadComponent: () => import('./turno/turno-summary.component').then((m) => m.TurnoSummaryComponent),
  },
];

export default routes;
