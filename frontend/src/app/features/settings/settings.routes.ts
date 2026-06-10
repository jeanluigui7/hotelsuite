import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'hotel',
    loadComponent: () => import('./hotel/hotel.component').then((m) => m.HotelComponent),
  },
  {
    path: 'tipos-habitacion',
    loadComponent: () => import('./tipos-habitacion/room-types.component').then((m) => m.RoomTypesComponent),
  },
  {
    path: 'atributos',
    loadComponent: () => import('./atributos/room-attributes.component').then((m) => m.RoomAttributesComponent),
  },
  {
    path: 'tiers',
    loadComponent: () => import('./tiers/client-tiers.component').then((m) => m.ClientTiersComponent),
  },
  {
    path: 'clientes',
    loadComponent: () => import('./clientes/guests.component').then((m) => m.GuestsComponent),
  },
  {
    path: 'tarifas',
    loadComponent: () => import('./tarifas/custom-rates.component').then((m) => m.CustomRatesComponent),
  },
  {
    path: 'items',
    loadComponent: () => import('./items/items.component').then((m) => m.ItemsComponent),
  },
  {
    path: 'horarios',
    loadComponent: () => import('./horarios/schedules.component').then((m) => m.SchedulesComponent),
  },
  {
    path: 'inspeccion',
    loadComponent: () => import('./inspeccion/checklist.component').then((m) => m.ChecklistComponent),
  },
  {
    path: 'lavanderia',
    loadComponent: () => import('./lavanderia/laundry-machines.component').then((m) => m.LaundryMachinesComponent),
  },
  {
    path: 'huella',
    loadComponent: () => import('./huella/biometrics.component').then((m) => m.BiometricsComponent),
  },
  {
    path: 'roles',
    loadComponent: () => import('./roles/roles.component').then((m) => m.RolesComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
