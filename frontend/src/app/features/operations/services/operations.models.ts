export type RoomStatus = 'FREE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';

export interface ActiveStay {
  id: string;
  guestName: string;
  checkInAt: string;
  plannedCheckoutAt: string;
  priceAgreed: string | number;
}

export interface RoomMapItem {
  id: string;
  number: string;
  floor?: string | null;
  status: RoomStatus;
  roomType: { id: string; name: string };
  notes?: string | null;
  activeStay: ActiveStay | null;
}

export interface Room {
  id: string;
  number: string;
  floor?: string | null;
  status: RoomStatus;
  roomTypeId: string;
  roomType: { id: string; name: string };
  notes?: string | null;
}

export interface RoomUpsert {
  roomTypeId: string;
  number: string;
  floor?: string;
  notes?: string;
}

export interface NewGuestInput {
  documentType: 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';
  documentNumber: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

export interface CheckInInput {
  roomId: string;
  rateId: string;
  tierId?: string | null;
  guestId?: string;
  newGuest?: NewGuestInput;
  additionalGuestIds: string[];
  adults: number;
  children: number;
  notes?: string;
}

export interface Stay {
  id: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  room: { id: string; number: string; floor?: string | null };
  guest: { id: string; firstName: string; lastName?: string | null; documentNumber: string };
  rate?: { id: string; label: string } | null;
  tier?: { id: string; name: string } | null;
  checkInAt: string;
  plannedCheckoutAt: string;
  checkOutAt?: string | null;
  durationMinutes: number;
  priceAgreed: string | number;
  adults: number;
  children: number;
  notes?: string | null;
  additionalGuests: { id: string; name: string }[];
}
