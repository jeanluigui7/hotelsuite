import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'habitaciones',
    loadComponent: () => import('./habitaciones/rooms-map.component').then((m) => m.RoomsMapComponent),
  },
  {
    path: 'estancias',
    loadComponent: () => import('./estancias/stay-history.component').then((m) => m.StayHistoryComponent),
  },
  {
    path: 'reservas',
    loadComponent: () => import('./reservas/reservations.component').then((m) => m.ReservationsComponent),
  },
  {
    path: 'observaciones',
    loadComponent: () => import('./observaciones/observations.component').then((m) => m.ObservationsComponent),
  },
  {
    path: 'conserjeria',
    loadComponent: () => import('./conserjeria/concierge.component').then((m) => m.ConciergeComponent),
  },
  {
    path: 'limpiezas',
    loadComponent: () => import('./limpiezas/housekeeping.component').then((m) => m.HousekeepingComponent),
  },
  {
    path: 'mantenimientos',
    loadComponent: () => import('./mantenimientos/maintenance.component').then((m) => m.MaintenanceComponent),
  },
  {
    path: 'revisiones',
    loadComponent: () => import('./revisiones/revisions.component').then((m) => m.RevisionsComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
