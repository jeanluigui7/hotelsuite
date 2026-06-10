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
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
