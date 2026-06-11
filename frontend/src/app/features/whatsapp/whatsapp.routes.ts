import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'instancias',
    loadComponent: () => import('./instancias/instances.component').then((m) => m.WaInstancesComponent),
  },
  {
    path: 'mensajes',
    loadComponent: () => import('./mensajes/templates.component').then((m) => m.WaTemplatesComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
