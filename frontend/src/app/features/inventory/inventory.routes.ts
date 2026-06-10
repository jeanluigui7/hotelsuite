import { Routes } from '@angular/router';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', component: PlaceholderPageComponent },
  {
    path: 'areas',
    loadComponent: () => import('./areas/areas.component').then((m) => m.AreasComponent),
  },
  {
    path: 'categorias',
    loadComponent: () =>
      import('./categorias/inventory-categories.component').then((m) => m.InventoryCategoriesComponent),
  },
  {
    path: 'articulos',
    loadComponent: () => import('./articulos/products.component').then((m) => m.ProductsComponent),
  },
  {
    path: 'almacenes',
    loadComponent: () => import('./almacenes/warehouses.component').then((m) => m.WarehousesComponent),
  },
  {
    path: 'movimientos',
    loadComponent: () => import('./movimientos/movements.component').then((m) => m.MovementsComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
