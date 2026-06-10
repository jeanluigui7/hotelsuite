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
  {
    path: 'comprobantes',
    loadComponent: () => import('./comprobantes/invoices.component').then((m) => m.InvoicesComponent),
  },
  {
    path: 'folios',
    loadComponent: () => import('./folios/folios.component').then((m) => m.FoliosComponent),
  },
  {
    path: 'panel-fiscal',
    loadComponent: () => import('./panel-fiscal/fiscal-panel.component').then((m) => m.FiscalPanelComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
