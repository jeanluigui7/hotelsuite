export interface Supplier {
  id: string;
  name: string;
  taxId?: string | null;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
}

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  supplierId: string;
  warehouseId: string;
  documentNumber?: string;
  notes?: string;
  items: PurchaseItemInput[];
}

export interface Purchase {
  id: string;
  supplier: { id: string; name: string };
  documentNumber?: string | null;
  total: string | number;
  status: string;
  createdAt: string;
  items: { id: string; productId: string; quantity: number; unitCost: string | number; subtotal: string | number }[];
}

export interface Valuation {
  items: { id: string; name: string; quantity: number; cost: number; value: number }[];
  total: number;
}

export interface ReorderReport {
  items: { id: string; name: string; stock: number; reorderPoint: number }[];
}

export interface ProfitReport {
  revenue: number;
  cost: number;
  profit: number;
  lineCount: number;
}
