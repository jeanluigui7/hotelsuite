import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'usuarios',
    loadComponent: () => import('./usuarios/usuarios.component').then((m) => m.UsuariosComponent),
  },
  {
    path: 'asistencias',
    loadComponent: () => import('./asistencias/attendance.component').then((m) => m.AttendanceComponent),
  },
  {
    path: 'actividades',
    loadComponent: () => import('./actividades/activity-log.component').then((m) => m.ActivityLogComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
