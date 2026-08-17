import { Routes } from '@angular/router';

/**
 * Módulo WiFi (nivel superior). WiFi es la FUENTE de la credencial del huésped;
 * WhatsApp y Tickets son canales que la consumen.
 *  - configuracion: modo de entrega (Global / por Tipo / por Tarifa / Pool) — modos internos.
 *  - pool: administración de credenciales/vouchers disponibles (reutiliza el componente existente).
 */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'configuracion' },
  {
    path: 'configuracion',
    loadComponent: () => import('./configuracion/wifi-config.component').then((m) => m.WifiConfigComponent),
  },
  {
    path: 'pool',
    loadComponent: () => import('./pool/wifi-pool.component').then((m) => m.WifiPoolComponent),
  },
];

export default routes;
