import type { RoomStatus } from '../services/operations.models';

/**
 * R0 — Sistema de diseño RIZZOS: configuración visual de los estados de habitación.
 * Los estados legacy (FREE/OCCUPIED/CLEANING/MAINTENANCE) se mapean a la nomenclatura
 * y colores del spec. A medida que se implementen los nuevos estados (LIMPIEZA_EN_ESPERA,
 * REQUIERE_REPASO, etc.) se agregan aquí.
 */
export interface RoomStateConfig {
  label: string;
  /** color base del estado (para badges y acentos) */
  color: string;
  /** degradado de fondo de la tarjeta */
  gradient: string;
  /** ícono del estado */
  icon: string;
  /** texto descriptivo dentro de la tarjeta */
  caption: string;
}

export const ROOM_STATES: Record<string, RoomStateConfig> = {
  FREE: {
    label: 'Disponible',
    color: '#10b981',
    gradient: 'linear-gradient(160deg, #0f9b6c 0%, #0b7551 100%)',
    icon: 'pi pi-check-circle',
    caption: 'Habitación disponible',
  },
  OCCUPIED: {
    label: 'Ocupada',
    color: '#6366f1',
    gradient: 'linear-gradient(160deg, #4f46e5 0%, #3730a3 100%)',
    icon: 'pi pi-user',
    caption: 'Habitación ocupada',
  },
  CLEANING: {
    label: 'Limpieza en espera',
    color: '#f59e0b',
    gradient: 'linear-gradient(160deg, #ea8a0b 0%, #c2640a 100%)',
    icon: 'pi pi-sparkles',
    caption: 'Limpieza en espera',
  },
  MAINTENANCE: {
    label: 'Mantenimiento',
    color: '#ef4444',
    gradient: 'linear-gradient(160deg, #b91c1c 0%, #7f1d1d 100%)',
    icon: 'pi pi-wrench',
    caption: 'En mantenimiento',
  },
  // Estados RIZZOS (se activan al construir sus flujos)
  RESERVADA: {
    label: 'Reservada',
    color: '#0ea5e9',
    gradient: 'linear-gradient(160deg, #0284c7 0%, #075985 100%)',
    icon: 'pi pi-bookmark',
    caption: 'Reservada',
  },
  LIMPIEZA_EN_CURSO: {
    label: 'Limpieza en curso',
    color: '#eab308',
    gradient: 'linear-gradient(160deg, #ca8a04 0%, #a16207 100%)',
    icon: 'pi pi-spin pi-cog',
    caption: 'Limpieza en curso',
  },
  LIMPIEZA_SOLICITADA: {
    label: 'Limpieza solicitada',
    color: '#f59e0b',
    gradient: 'linear-gradient(160deg, #b45309 0%, #92400e 100%)',
    icon: 'pi pi-bell',
    caption: 'Limpieza solicitada',
  },
  REQUIERE_REPASO: {
    label: 'Requiere repaso',
    color: '#dc2626',
    gradient: 'linear-gradient(160deg, #991b1b 0%, #450a0a 100%)',
    icon: 'pi pi-exclamation-triangle',
    caption: 'No pasó inspección',
  },
  INSPECCIONANDO: {
    label: 'Inspeccionando',
    color: '#94a3b8',
    gradient: 'linear-gradient(160deg, #475569 0%, #334155 100%)',
    icon: 'pi pi-search',
    caption: 'Inspección en curso',
  },
};

export function roomState(status: RoomStatus | string): RoomStateConfig {
  return ROOM_STATES[status] ?? ROOM_STATES['INSPECCIONANDO'];
}
