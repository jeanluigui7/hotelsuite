import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guard';

/**
 * Módulo WiFi (nivel superior). WiFi es la FUENTE de la credencial del huésped;
 * WhatsApp y Tickets son canales que la consumen.
 *  - configuracion: modo de entrega (Global / por Tipo / por Tarifa / Pool) — modos internos.
 *  - pool: administración de credenciales/vouchers disponibles (reutiliza el componente existente).
 */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'configuracion' },
  {
    // Configuración del modo de entrega: SOLO administración.
    path: 'configuracion',
    canActivate: [permissionGuard],
    data: { permission: { module: 'settings', action: 'view' } },
    loadComponent: () => import('./configuracion/wifi-config.component').then((m) => m.WifiConfigComponent),
  },
  {
    // Pool operativo: recepción (asignar/imprimir, voucher enmascarado) y administración (gestión).
    path: 'pool',
    loadComponent: () => import('./pool/wifi-pool.component').then((m) => m.WifiPoolComponent),
  },
];

export default routes;
