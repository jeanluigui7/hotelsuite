import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'roles',
    loadComponent: () => import('./roles/roles.component').then((m) => m.RolesComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
