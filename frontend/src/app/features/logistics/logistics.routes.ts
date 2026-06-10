import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'proveedores',
    loadComponent: () => import('./proveedores/suppliers.component').then((m) => m.SuppliersComponent),
  },
  {
    path: 'ingresos',
    loadComponent: () => import('./ingresos/purchases.component').then((m) => m.PurchasesComponent),
  },
  {
    path: 'valorizacion',
    loadComponent: () => import('./valorizacion/stock-valuation.component').then((m) => m.StockValuationComponent),
  },
  {
    path: 'reponer',
    loadComponent: () => import('./reponer/reorder.component').then((m) => m.ReorderComponent),
  },
  {
    path: 'ganancias',
    loadComponent: () => import('./ganancias/profit.component').then((m) => m.ProfitComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
