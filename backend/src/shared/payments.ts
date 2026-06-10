/** Fixed payment methods for FASE 4 (configurable catalog deferred). */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
