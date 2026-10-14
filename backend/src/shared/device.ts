import { UAParser } from 'ua-parser-js';

/** Tipos de dispositivo que el control de acceso reconoce. */
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'other';

export const ALL_DEVICE_TYPES: DeviceType[] = ['mobile', 'tablet', 'desktop', 'other'];

export const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: 'Móvil',
  tablet: 'Tablet',
  desktop: 'Escritorio',
  other: 'Otro',
};

/**
 * Clasifica el dispositivo a partir del User-Agent del navegador.
 * ua-parser-js deja `device.type` indefinido para escritorio; móvil/tablet vienen explícitos.
 * Nota: el iPad moderno con Safari se reporta como escritorio (limitación del propio iPad).
 */
export function classifyDevice(userAgent: string | undefined | null): DeviceType {
  if (!userAgent) return 'other';
  const type = new UAParser(userAgent).getDevice().type;
  if (type === 'mobile') return 'mobile';
  if (type === 'tablet') return 'tablet';
  if (!type) return 'desktop';
  return 'other';
}
