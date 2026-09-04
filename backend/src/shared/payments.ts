/**
 * Métodos de pago. YAPE y PLIN son billeteras separadas (para rastrear el destino del
 * pago por banco). WALLET se conserva por compatibilidad con registros antiguos.
 */
// VUELTO = pago con el saldo de vuelto pendiente de la estancia (no ingresa efectivo nuevo; el dinero
// ya estaba en el cajón). Se excluye del efectivo esperado (el arqueo solo cuenta CASH) pero cuenta
// como ingreso por concepto.
export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET', 'VUELTO'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Etiquetas visibles de cada método (incluye legado WALLET). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', WALLET: 'Billetera', VUELTO: 'Vuelto',
};

/** Métodos que exigen código de operación/verificación (todos menos efectivo y vuelto). */
export function requiresReference(method: string): boolean {
  return method !== 'CASH' && method !== 'VUELTO';
}

/** Mensaje único para el código de operación obligatorio. */
export const PAYMENT_REFERENCE_REQUIRED = 'El código de operación es obligatorio para pagos con Yape, Plin, Transferencia o Tarjeta.';

/** Refinamiento Zod para un pago { method, reference? }: exige referencia si el método no es efectivo. */
export function hasRequiredReference(p: { method: string; reference?: string | null }): boolean {
  return !requiresReference(p.method) || !!(p.reference && p.reference.trim());
}
