export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  category?: { id: string; name: string } | null;
  categoryId?: string | null;
  salePrice: string | number;
  cost?: string | number | null;
  reorderPoint: number;
  status: string;
  stock: number;
}

export interface ProductUpsert {
  name: string;
  sku?: string;
  categoryId?: string | null;
  salePrice: number;
  cost?: number;
  reorderPoint?: number;
  status: 'active' | 'inactive';
  stock?: number;
}

export type WarehouseType = 'PRODUCTS' | 'CLOTHING' | 'RECEPTION' | 'CLEANING' | 'LAUNDRY' | 'AMENITIES';

export interface Warehouse {
  id: string;
  name: string;
  type: WarehouseType;
  status: string;
}

export interface InventoryMovement {
  id: string;
  type: string;
  productName: string;
  warehouseName: string;
  relatedWarehouseName?: string | null;
  quantity: number;
  unitCost?: string | number | null;
  reference?: string | null;
  createdAt: string;
}

export interface WarehouseStockItem {
  productId: string;
  name: string;
  sku?: string | null;
  quantity: number;
  reorderPoint: number;
  belowReorder: boolean;
}

export interface WarehouseStock {
  warehouse: { id: string; name: string; type: WarehouseType };
  items: WarehouseStockItem[];
}

export interface InventoryConfig {
  defaultWarehouseId: string | null;
  defaultReorderPoint: number;
  lowStockAlert: boolean;
}
