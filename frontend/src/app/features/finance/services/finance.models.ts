export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'WALLET';

export interface CashSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingAmount: string | number;
  closingAmount?: string | number | null;
  expectedAmount?: string | number | null;
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
}

export interface CashSummary {
  byMethod: Record<string, number>;
  totalCollected: number;
  movementsIn?: number;
  movementsOut?: number;
  expectedCash: number;
  salesCount: number;
}

export interface CashMovement {
  id: string;
  type: 'IN' | 'OUT';
  amount: string | number;
  concept: string;
  createdAt: string;
}

export interface SessionReport {
  session: CashSession;
  summary: CashSummary;
  movements: CashMovement[];
  byItem: { description: string; quantity: number; total: number }[];
  countedAmount?: string | number | null;
  difference: number | null;
}

export interface CashCurrent {
  session: CashSession | null;
  summary?: CashSummary;
}

export interface CloseResult {
  session: CashSession;
  summary: CashSummary;
  difference: number;
}

export interface SaleItemInput {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CreateSaleInput {
  stayId?: string | null;
  guestId?: string | null;
  customerName?: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
}

export interface Sale {
  id: string;
  stayId?: string | null;
  guestId?: string | null;
  customerName?: string | null;
  total: string | number;
  paid: number;
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  createdAt: string;
  items: { id: string; description: string; quantity: number; unitPrice: string | number; subtotal: string | number }[];
  payments: { id: string; method: string; amount: string | number; reference?: string | null }[];
}
