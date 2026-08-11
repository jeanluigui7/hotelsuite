/**
 * Métodos de pago. YAPE y PLIN son billeteras separadas (para rastrear el destino del
 * pago por banco). WALLET se conserva por compatibilidad con registros antiguos.
 */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Etiquetas visibles de cada método (incluye legado WALLET). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', WALLET: 'Billetera',
};
