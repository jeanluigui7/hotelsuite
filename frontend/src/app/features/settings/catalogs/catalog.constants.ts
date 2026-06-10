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

/** Common duration presets (minutes) for rate creation. */
export const DURATION_PRESETS = [
  { label: '1 hora', value: 60 },
  { label: '3 horas', value: 180 },
  { label: '6 horas', value: 360 },
  { label: '12 horas', value: 720 },
  { label: 'Noche (24h)', value: 1440 },
];
