/**
 * Menú modular principal (§1.1 del PROMPT_SISTEMA_HOTELERO).
 * Estático en FASE 0. Desde FASE 1 se filtrará por permisos (RBAC).
 */
export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  children?: { label: string; route: string }[];
}

export const APP_MENU: MenuItem[] = [
  {
    label: 'Tablero',
    icon: 'pi pi-th-large',
    route: '/dashboard',
    children: [
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
      { label: 'Caja', route: '/operations/caja' },
      { label: 'Inventario Recepción', route: '/operations/inventario-recepcion' },
      { label: 'Frigobar', route: '/operations/frigobar' },
      { label: 'Historial de Estancias', route: '/operations/estancias' },
      { label: 'Productos y Servicios', route: '/operations/productos' },
      { label: 'Check-Outs', route: '/operations/checkouts' },
      { label: 'Reservas', route: '/operations/reservas' },
      { label: 'Conserjería', route: '/operations/conserjeria' },
      { label: 'Gestión de Limpieza', route: '/operations/gestion-limpieza' },
      { label: 'Inventario Limpieza', route: '/operations/inventario-limpieza' },
      { label: 'Reporte Turno (Limpieza)', route: '/operations/turno-limpieza' },
      { label: 'Revisión Periódica', route: '/operations/revision-periodica' },
      { label: 'Transferencia de Ropa (Admin)', route: '/operations/transferencia-ropa' },
      { label: 'Almacén de Productos (Admin)', route: '/operations/almacen-productos' },
      { label: 'Historial de Limpiezas', route: '/operations/limpiezas' },
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
      { label: 'Configuración', route: '/inventory/configuracion' },
      { label: 'Áreas', route: '/inventory/areas' },
      { label: 'Categorías', route: '/inventory/categorias' },
      { label: 'Artículos', route: '/inventory/articulos' },
      { label: 'Movimientos', route: '/inventory/movimientos' },
      { label: 'Movimientos de Limpieza', route: '/inventory/movimientos-limpieza' },
      { label: 'Almacenes', route: '/inventory/almacenes' },
      { label: 'Inventario de Limpieza', route: '/inventory/inventario-limpieza' },
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
      { label: 'Tipos de Habitación', route: '/settings/tipos-habitacion' },
      { label: 'Atributos de Habitación', route: '/settings/atributos' },
      { label: 'Tarifa Personalizada', route: '/settings/tarifas' },
      { label: 'Permisos por Categoría', route: '/settings/permisos' },
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
