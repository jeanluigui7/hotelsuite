export type ServiceTipo = 'SERVICIO' | 'PENALIDAD';
export type ConceptUnit = 'UNIDAD' | 'SERVICIO' | 'KILOGRAMO';
export type AttentionMode = 'NONE' | 'LINEN_EXTRA';
export type CatalogStatus = 'active' | 'inactive';
export type InventoryOrigin = 'ROPA' | 'AMENITY';
export type ArticleScope = 'ALL' | 'SPECIFIC';

/** Artículo vinculado a un concepto (inclusión en SPECIFIC y/o precio por artículo). */
export interface SCConceptArticle {
  articleId: string;
  price: string | number | null;
}

/** Categoría de inventario (tipo de prenda CLOTHING / grupo de amenities AMENITY). */
export interface InvCategory {
  id: string;
  name: string;
  type: string;
}

/** Artículo real del inventario (ropa = LinenItem; amenity = Product). */
export interface InvArticle {
  id: string;
  name: string;
  code?: string | null;
  sku?: string | null;
  type?: string | null;
}

export interface SCConcept {
  id: string;
  groupId: string;
  code: string;
  name: string;
  description?: string | null;
  price: string | number;
  unit: ConceptUnit;
  sortOrder: number;
  status: CatalogStatus;
  allowCourtesy: boolean;
  allowFreeAmount: boolean;
  attentionMode: AttentionMode;
  inventoryOrigin?: InventoryOrigin | null;
  inventoryCategoryId?: string | null;
  inventoryCategory?: InvCategory | null;
  articleScope: ArticleScope;
  articles: SCConceptArticle[];
  requiresDelivery: boolean;
  requiresReturn: boolean;
  linkNeedsReview?: boolean;
}

export interface SCGroup {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  status: CatalogStatus;
  concepts: SCConcept[];
}

export interface SCCategory {
  id: string;
  tipo: ServiceTipo;
  name: string;
  description?: string | null;
  sortOrder: number;
  status: CatalogStatus;
  groups: SCGroup[];
}

/** Artículo real candidato para "ropa adicional". */
export interface LinenArticle {
  id: string;
  name: string;
  salePrice: string | number;
  reusable: boolean;
  category?: { name: string; type?: string | null } | null;
}

export const UNIT_LABEL: Record<ConceptUnit, string> = {
  UNIDAD: 'Unidad',
  SERVICIO: 'Servicio',
  KILOGRAMO: 'Kilogramo',
};

export const ATTENTION_LABEL: Record<AttentionMode, string> = {
  NONE: 'Sin entrega gestionada',
  LINEN_EXTRA: 'Entrega de adicionales por cleaning',
};

export const ORIGIN_LABEL: Record<InventoryOrigin, string> = {
  ROPA: 'Ropa',
  AMENITY: 'Amenities',
};
