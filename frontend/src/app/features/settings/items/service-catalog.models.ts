export type ServiceTipo = 'SERVICIO' | 'PENALIDAD';
export type ConceptUnit = 'UNIDAD' | 'SERVICIO' | 'KILOGRAMO';
export type AttentionMode = 'NONE' | 'LINEN_EXTRA';
export type CatalogStatus = 'active' | 'inactive';

export interface SCConceptProduct {
  id: string;
  name: string;
  category?: { name: string } | null;
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
  productId?: string | null;
  requiresDelivery: boolean;
  requiresReturn: boolean;
  product?: SCConceptProduct | null;
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
  LINEN_EXTRA: 'Entrega de ropa adicional por cleaning',
};
