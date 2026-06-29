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
  {
    path: 'configuracion',
    loadComponent: () => import('./configuracion/inventory-config.component').then((m) => m.InventoryConfigComponent),
  },
  {
    path: 'movimientos-limpieza',
    loadComponent: () =>
      import('./movimientos-limpieza/cleaning-movements.component').then((m) => m.CleaningMovementsComponent),
  },
  {
    path: 'inventario-limpieza',
    loadComponent: () => import('./inventario-limpieza/cleaning-stock.component').then((m) => m.CleaningStockComponent),
  },
  {
    path: 'almacen',
    loadComponent: () => import('./almacen-stock/warehouse-stock.component').then((m) => m.WarehouseStockComponent),
  },
  {
    path: 'inventario-inicial',
    loadComponent: () => import('./inventario-inicial/inventario-inicial.component').then((m) => m.InventarioInicialComponent),
  },
  {
    path: 'kardex-inventario',
    loadComponent: () => import('./kardex-inventario/kardex-inventario.component').then((m) => m.KardexInventarioComponent),
  },
  {
    path: 'mapa-almacenes',
    loadComponent: () => import('./mapa-almacenes/mapa-almacenes.component').then((m) => m.MapaAlmacenesComponent),
  },
  { path: ':sub', component: PlaceholderPageComponent },
];

export default routes;
