export interface RoomAttribute {
  id: string;
  name: string;
  icon?: string | null;
  status: string;
}

export interface RoomTypeAttributeRef {
  id: string;
  name: string;
  icon?: string | null;
}

export interface RoomType {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
  basePrice?: string | number | null;
  status: string;
  rateCount: number;
  attributeIds: string[];
  attributes: RoomTypeAttributeRef[];
}

export interface ClientTier {
  id: string;
  name: string;
  discountPercent: string | number;
  description?: string | null;
  status: string;
}

export type DocumentType = 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';

export interface Guest {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status: string;
}

export interface Rate {
  id: string;
  roomTypeId: string;
  roomType?: { id: string; name: string };
  label: string;
  durationMinutes: number;
  price: string | number;
  status: string;
}

export interface CustomRate {
  id: string;
  roomTypeId: string;
  tierId?: string | null;
  roomType?: { id: string; name: string };
  tier?: { id: string; name: string } | null;
  label: string;
  durationMinutes: number;
  price: string | number;
  validFrom?: string | null;
  validTo?: string | null;
  status: string;
}
