export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  category?: { id: string; name: string } | null;
  categoryId?: string | null;
  salePrice: string | number;
  cost?: string | number | null;
  status: string;
  stock: number;
}

export interface ProductUpsert {
  name: string;
  sku?: string;
  categoryId?: string | null;
  salePrice: number;
  cost?: number;
  status: 'active' | 'inactive';
  stock?: number;
}
