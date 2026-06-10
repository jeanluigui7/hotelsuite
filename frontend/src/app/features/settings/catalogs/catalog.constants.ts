export const STATUS_OPTIONS = [
  { label: 'Activo', value: 'active' },
  { label: 'Inactivo', value: 'inactive' },
];

export const DOCUMENT_TYPE_OPTIONS = [
  { label: 'DNI', value: 'DNI' },
  { label: 'Carné de Extranjería', value: 'CE' },
  { label: 'Pasaporte', value: 'PASAPORTE' },
  { label: 'RUC', value: 'RUC' },
];

export const ITEM_KIND_OPTIONS = [
  { label: 'Check-In', value: 'CHECKIN' },
  { label: 'Por Tarifa', value: 'RATE' },
  { label: 'Servicios / Penalidades', value: 'SERVICE_PENALTY' },
  { label: 'Mantenimiento', value: 'MAINTENANCE' },
];

export const DAY_OPTIONS = [
  { label: 'Lun', value: 1 },
  { label: 'Mar', value: 2 },
  { label: 'Mié', value: 3 },
  { label: 'Jue', value: 4 },
  { label: 'Vie', value: 5 },
  { label: 'Sáb', value: 6 },
  { label: 'Dom', value: 7 },
];

/** Common duration presets (minutes) for rate creation. */
export const DURATION_PRESETS = [
  { label: '1 hora', value: 60 },
  { label: '3 horas', value: 180 },
  { label: '6 horas', value: 360 },
  { label: '12 horas', value: 720 },
  { label: 'Noche (24h)', value: 1440 },
];
