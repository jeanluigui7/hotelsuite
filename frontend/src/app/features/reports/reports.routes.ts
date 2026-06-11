import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'cuadro-turno',
    loadComponent: () => import('./cuadro-turno/turn-report.component').then((m) => m.TurnReportComponent),
  },
  {
    path: 'lavanderia',
    loadComponent: () => import('./lavanderia/laundry.component').then((m) => m.LaundryComponent),
  },
  {
    path: 'rendimiento',
    loadComponent: () => import('./rendimiento/performance.component').then((m) => m.PerformanceComponent),
  },
  {
    path: 'habitaciones',
    loadComponent: () => import('./habitaciones/rooms-report.component').then((m) => m.RoomsReportComponent),
  },
  {
    path: 'limpiezas',
    loadComponent: () => import('./limpiezas/housekeeping-report.component').then((m) => m.HousekeepingReportComponent),
  },
  {
    path: 'ventas',
    loadComponent: () => import('./ventas/sales-detailed.component').then((m) => m.SalesDetailedComponent),
  },
  {
    path: 'simulador',
    loadComponent: () => import('./simulador/product-limit.component').then((m) => m.ProductLimitComponent),
  },
  {
    path: 'inspecciones',
    loadComponent: () => import('./inspecciones/inspections.component').then((m) => m.InspectionsReportComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
