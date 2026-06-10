import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'cuadro-turno',
    loadComponent: () => import('./cuadro-turno/turn-report.component').then((m) => m.TurnReportComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
