import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'sucursales',
    loadComponent: () => import('./sucursales/branches.component').then((m) => m.BranchesComponent),
  },
  {
    path: 'hotel',
    loadComponent: () => import('./hotel/hotel.component').then((m) => m.HotelComponent),
  },
  {
    path: 'pernoctacion',
    loadComponent: () => import('./pernoctacion/pernocta.component').then((m) => m.PernoctaConfigComponent),
  },
  {
    path: 'permisos-recepcion',
    loadComponent: () => import('./permisos-recepcion/permisos-recepcion.component').then((m) => m.PermisosRecepcionComponent),
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
    path: 'recordatorios',
    loadComponent: () => import('./recordatorios/reminders.component').then((m) => m.RemindersComponent),
  },
  {
    path: 'landing',
    loadComponent: () => import('./landing/landing-config.component').then((m) => m.LandingConfigComponent),
  },
  {
    path: 'landing-habitaciones',
    loadComponent: () => import('./landing/landing-config.component').then((m) => m.LandingConfigComponent),
  },
  {
    path: 'roles',
    loadComponent: () => import('./roles/roles.component').then((m) => m.RolesComponent),
  },
  {
    path: 'wifi',
    loadComponent: () => import('./wifi/wifi.component').then((m) => m.WifiPoolComponent),
  },
  {
    path: 'permisos',
    loadComponent: () =>
      import('./permisos/permissions-by-category.component').then((m) => m.PermissionsByCategoryComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
