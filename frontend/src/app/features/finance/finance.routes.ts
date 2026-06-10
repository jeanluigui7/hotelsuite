import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'cajas',
    loadComponent: () => import('./cajas/cash.component').then((m) => m.CashComponent),
  },
  {
    path: 'pagos',
    loadComponent: () => import('./pagos/sales.component').then((m) => m.SalesComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
