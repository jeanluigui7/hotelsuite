/**
 * Menús de RIZZOS por PERFIL (según "SISTEMA RIZZOS.docx").
 * El sidebar elige el menú según el rol del usuario autenticado:
 *  - PERFIL LIMPIEZA      → LIMPIEZA_MENU
 *  - PERFIL RECEPCIONISTA → RECEPCION_MENU
 *  - PERFIL ADMINISTRADOR → ADMIN_MENU (acceso total)
 */
export interface MenuLeaf {
  label: string;
  route: string;
  queryParams?: Record<string, string>;
}
export interface MenuChild extends MenuLeaf {
  /** Subgrupo expandible (segundo nivel), p. ej. Inventario › Almacenes › … */
  children?: MenuLeaf[];
}
export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  children?: MenuChild[];
}

/** PERFIL LIMPIEZA (img. 1 del documento). */
export const LIMPIEZA_MENU: MenuItem[] = [
  { label: 'Inicio', icon: 'pi pi-th-large', route: '/dashboard/limpieza' },
  { label: 'Habitaciones', icon: 'pi pi-building', route: '/operations/gestion-limpieza' },
  { label: 'Limpieza por Inventario', icon: 'pi pi-box', route: '/operations/limpieza-inventario' },
  { label: 'Lavandería (Ropa)', icon: 'pi pi-sync', route: '/operations/lavanderia-ropa' },
  { label: 'Historial', icon: 'pi pi-history', route: '/operations/limpiezas' },
  { label: 'Inventario Limpieza', icon: 'pi pi-box', route: '/operations/inventario-limpieza' },
  { label: 'Revisiones', icon: 'pi pi-verified', route: '/operations/revisiones' },
  { label: 'Movimientos', icon: 'pi pi-sync', route: '/inventory/movimientos-limpieza' },
  { label: 'Reporte Turno', icon: 'pi pi-chart-bar', route: '/operations/turno-limpieza' },
];

/** PERFIL RECEPCIONISTA (img. 52 + secciones del documento). */
export const RECEPCION_MENU: MenuItem[] = [
  { label: 'Inicio', icon: 'pi pi-th-large', route: '/dashboard/recepcion' },
  { label: 'Habitaciones', icon: 'pi pi-building', route: '/operations/habitaciones' },
  {
    label: 'Estancias',
    icon: 'pi pi-clock',
    route: '/operations/estancias',
    children: [
      { label: 'Historial de estancias', route: '/operations/estancias' },
      { label: 'Check Outs', route: '/operations/checkouts' },
      { label: 'Observaciones', route: '/operations/observaciones' },
    ],
  },
  { label: 'Reservas', icon: 'pi pi-calendar', route: '/operations/reservas' },
  { label: 'Conserjería', icon: 'pi pi-bell', route: '/operations/conserjeria' },
  { label: 'Venta de Productos', icon: 'pi pi-shopping-cart', route: '/operations/frigobar' },
  { label: 'Cajas', icon: 'pi pi-wallet', route: '/operations/caja' },
  {
    label: 'Inventario',
    icon: 'pi pi-box',
    route: '/operations/inventario-recepcion',
    children: [
      { label: 'Inventario de Productos', route: '/operations/inventario-recepcion' },
      { label: 'Historial de Productos y Servicios', route: '/operations/productos' },
      { label: 'Inventario de Limpieza', route: '/inventory/inventario-limpieza' },
    ],
  },
];

/** PERFIL ADMINISTRADOR (img. 99) — acceso total a todos los módulos. */
export const ADMIN_MENU: MenuItem[] = [
  {
    label: 'Tablero',
    icon: 'pi pi-th-large',
    route: '/dashboard',
    children: [
      { label: 'Vista General', route: '/dashboard' },
      { label: 'Resumen de Recepción', route: '/dashboard/recepcion' },
      { label: 'Resumen de Limpieza', route: '/dashboard/limpieza' },
      { label: 'Resumen de Caja', route: '/dashboard/caja' },
      { label: 'Control de Turno', route: '/dashboard/turno' },
    ],
  },
  {
    label: 'Operaciones',
    icon: 'pi pi-building',
    route: '/operations',
    children: [
      { label: 'Habitaciones', route: '/operations/habitaciones' },
      { label: 'Frigobar', route: '/operations/frigobar' },
      { label: 'Historial de Estancias', route: '/operations/estancias' },
      { label: 'Productos y Servicios', route: '/operations/productos' },
      { label: 'Check-Outs', route: '/operations/checkouts' },
      { label: 'Reservas', route: '/operations/reservas' },
      { label: 'Conserjería', route: '/operations/conserjeria' },
      { label: 'Historial de Limpiezas', route: '/operations/limpiezas' },
      { label: 'Caja', route: '/operations/caja' },
      { label: 'Inventario Recepción', route: '/operations/inventario-recepcion' },
      { label: 'Gestión de Limpieza', route: '/operations/gestion-limpieza' },
      { label: 'Limpieza por Inventario', route: '/operations/limpieza-inventario' },
      { label: 'Lavandería (Ropa)', route: '/operations/lavanderia-ropa' },
      { label: 'Inventario Limpieza', route: '/operations/inventario-limpieza' },
      { label: 'Reporte Turno (Limpieza)', route: '/operations/turno-limpieza' },
      { label: 'Revisión Periódica', route: '/operations/revision-periodica' },
      { label: 'Transferencia de Ropa', route: '/operations/transferencia-ropa' },
      { label: 'Almacén de Productos', route: '/operations/almacen-productos' },
      { label: 'Revisiones', route: '/operations/revisiones' },
      { label: 'Mantenimientos', route: '/operations/mantenimientos' },
      { label: 'Observaciones', route: '/operations/observaciones' },
    ],
  },
  {
    label: 'Finanzas',
    icon: 'pi pi-wallet',
    route: '/finance',
    children: [
      { label: 'Pagos', route: '/finance/pagos' },
      { label: 'Cajas', route: '/finance/cajas' },
      { label: 'Tickets', route: '/finance/tickets' },
      { label: 'Comprobantes', route: '/finance/comprobantes' },
      { label: 'Panel Fiscal', route: '/finance/panel-fiscal' },
      { label: 'Folios Maestros', route: '/finance/folios' },
    ],
  },
  {
    label: 'Inventario',
    icon: 'pi pi-box',
    route: '/inventory',
    children: [
      { label: 'Resumen', route: '/inventory/almacen' },
      { label: 'Mapa de Almacenes', route: '/inventory/mapa-almacenes' },
      {
        label: 'Almacenes',
        route: '/inventory/_almacenes',
        children: [
          { label: 'Almacén de Productos', route: '/operations/almacen-productos' },
          { label: 'Recepción', route: '/operations/inventario-recepcion' },
          { label: 'Productos - Limpieza', route: '/inventory/almacen', queryParams: { name: 'PRODUCTOS LIMPIEZA' } },
          { label: 'Almacén de Ropa', route: '/operations/almacen-ropa' },
          { label: 'Ropa - Limpieza', route: '/inventory/almacen', queryParams: { name: 'ROPA - LIMPIEZA' } },
          { label: 'Amenities', route: '/inventory/almacen', queryParams: { type: 'AMENITIES' } },
          { label: 'Inventario de Limpieza', route: '/operations/inventario-limpieza' },
          { label: 'Lavandería', route: '/inventory/almacen', queryParams: { type: 'LAUNDRY' } },
        ],
      },
      {
        label: 'Movimientos',
        route: '/inventory/_movimientos',
        children: [
          { label: 'Movimientos de Productos', route: '/inventory/movimientos' },
          { label: 'Movimientos de Limpieza', route: '/inventory/movimientos-limpieza' },
          { label: 'Movimientos de Lavandería', route: '/inventory/movimientos', queryParams: { type: 'LAUNDRY' } },
          { label: 'Kardex de Inventario (Ropa)', route: '/inventory/kardex-inventario' },
        ],
      },
      {
        label: 'Configuración',
        route: '/inventory/_config',
        children: [
          { label: 'Áreas', route: '/inventory/areas' },
          { label: 'Categorías', route: '/inventory/categorias' },
          { label: 'Artículos', route: '/inventory/articulos' },
          { label: 'Almacenes', route: '/inventory/almacenes' },
          { label: 'Inventario Inicial (Habitaciones)', route: '/inventory/inventario-inicial' },
          { label: 'Configuración General', route: '/inventory/configuracion' },
        ],
      },
    ],
  },
  {
    label: 'Logística',
    icon: 'pi pi-truck',
    route: '/logistics',
    children: [
      { label: 'Kardex', route: '/logistics/kardex' },
      { label: 'Proveedores', route: '/logistics/proveedores' },
      { label: 'Ingresos con Factura', route: '/logistics/ingresos' },
      { label: 'Valorización de Stock', route: '/logistics/valorizacion' },
      { label: 'Reporte de Ganancias', route: '/logistics/ganancias' },
      { label: 'Productos a Reponer', route: '/logistics/reponer' },
    ],
  },
  {
    label: 'Recursos Humanos',
    icon: 'pi pi-users',
    route: '/hr',
    children: [
      { label: 'Usuarios', route: '/hr/usuarios' },
      { label: 'Asistencias', route: '/hr/asistencias' },
      { label: 'Historial de Actividades', route: '/hr/actividades' },
    ],
  },
  {
    label: 'Reportes',
    icon: 'pi pi-chart-bar',
    route: '/reports',
    children: [
      { label: 'Reporte de Habitaciones', route: '/reports/habitaciones' },
      { label: 'Reporte de Limpiezas', route: '/reports/limpiezas' },
      { label: 'Inspecciones de Limpieza', route: '/reports/inspecciones' },
      { label: 'Ventas Detalladas', route: '/reports/ventas' },
      { label: 'Reporte Lavandería', route: '/reports/lavanderia' },
      { label: 'Cuadro de Turno', route: '/reports/cuadro-turno' },
      { label: 'Historial de Turnos', route: '/reports/turnos' },
      { label: 'Simulador Límite Productos', route: '/reports/simulador' },
      { label: 'Rendimiento General', route: '/reports/rendimiento' },
    ],
  },
  {
    label: 'WhatsApp',
    icon: 'pi pi-whatsapp',
    route: '/whatsapp',
    children: [
      { label: 'Instancias', route: '/whatsapp/instancias' },
      { label: 'Configuración de Mensajes', route: '/whatsapp/mensajes' },
    ],
  },
  {
    label: 'Configuraciones',
    icon: 'pi pi-cog',
    route: '/settings',
    children: [
      { label: 'Sucursales', route: '/settings/sucursales' },
      { label: 'Hotel', route: '/settings/hotel' },
      { label: 'Pernoctación (Día Hotelero)', route: '/settings/pernoctacion' },
      { label: 'Permisos de Recepción', route: '/settings/permisos-recepcion' },
      { label: 'Pool WiFi', route: '/settings/wifi' },
      { label: 'Clientes', route: '/settings/clientes' },
      { label: 'Tiers de Clientes', route: '/settings/tiers' },
      { label: 'Tarifas', route: '/settings/tarifas-base' },
      { label: 'Tipos de Habitación', route: '/settings/tipos-habitacion' },
      { label: 'Atributos de Habitación', route: '/settings/atributos' },
      { label: 'Tarifa Personalizada', route: '/settings/tarifas' },
      { label: 'Permisos por Categoría', route: '/settings/permisos' },
      { label: 'Dotación Base (Habitaciones)', route: '/settings/dotacion' },
      { label: 'Inspección de Limpieza', route: '/settings/inspeccion' },
      { label: 'Horarios', route: '/settings/horarios' },
      { label: 'Autenticación por Roles', route: '/settings/roles' },
      { label: 'Huella Digital', route: '/settings/huella' },
      { label: 'Items', route: '/settings/items' },
      { label: 'Máquinas de Lavandería', route: '/settings/lavanderia' },
      { label: 'Recordatorios', route: '/settings/recordatorios' },
      { label: 'Landing Page', route: '/settings/landing' },
      { label: 'Landing Habitaciones', route: '/settings/landing-habitaciones' },
    ],
  },
];

/** Compatibilidad: el menú completo sigue siendo el del administrador. */
export const APP_MENU = ADMIN_MENU;

export type Profile = 'limpieza' | 'recepcion' | 'admin';

/** Determina el perfil a partir del nombre del rol. */
export function profileForRole(roleName: string | undefined, isSuperAdmin: boolean): Profile {
  if (isSuperAdmin) return 'admin';
  const r = (roleName ?? '').toLowerCase();
  if (r.includes('limpieza')) return 'limpieza';
  if (r.includes('recep') || r.includes('caja')) return 'recepcion';
  if (r.includes('gerente') || r.includes('admin')) return 'admin';
  return 'admin';
}

/** Devuelve el menú correspondiente al perfil. */
export function menuForProfile(profile: Profile): MenuItem[] {
  switch (profile) {
    case 'limpieza':
      return LIMPIEZA_MENU;
    case 'recepcion':
      return RECEPCION_MENU;
    default:
      return ADMIN_MENU;
  }
}
