export type RoomStatus = 'FREE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';

export interface ActiveStay {
  id: string;
  guestName: string;
  documentNumber?: string | null;
  phone?: string | null;
  guestCount?: number;
  checkInAt: string;
  plannedCheckoutAt: string;
  durationMinutes?: number;
  priceAgreed: string | number;
  balanceDue?: string | number | null;
  pending?: number;
  consumosTotal?: number;
  vehiclePlate?: string | null;
}

export interface CheckoutSummary {
  balanceDue: number;
  salesPending: number;
  total: number;
  lateHours: number;
  lateCharge: number;
  plannedCheckoutAt: string;
  totalWithLate: number;
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
  vehiclePlate?: string;
  notes?: string;
  nights?: number;
  priceOverride?: number;
}

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FULFILLED';

export interface Reservation {
  id: string;
  roomType: { id: string; name: string };
  room?: { id: string; number: string } | null;
  guestId?: string | null;
  guestName?: string | null;
  phone?: string | null;
  expectedCheckInAt: string;
  durationMinutes: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  notes?: string | null;
}

export interface Observation {
  id: string;
  room?: { id: string; number: string } | null;
  title?: string | null;
  body: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
}

export interface ConciergeRequest {
  id: string;
  room?: { id: string; number: string } | null;
  guestName?: string | null;
  category?: string | null;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  createdAt: string;
}

export interface Maintenance {
  id: string;
  roomId?: string | null;
  roomNumber?: string | null;
  title: string;
  description?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  cost?: string | number | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface MaintenanceUpsert {
  roomId?: string | null;
  title: string;
  description?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  cost?: number;
}

export interface Revision {
  id: string;
  roomId: string;
  roomNumber: string;
  notes?: string | null;
  status: 'PENDING' | 'OK' | 'ISSUE';
  createdAt: string;
}

export interface RevisionUpsert {
  roomId: string;
  notes?: string;
  status: 'PENDING' | 'OK' | 'ISSUE';
}

export interface HousekeepingTask {
  id: string;
  roomId: string;
  roomNumber: string;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'INSPECTED';
  result: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string | null;
  completedAt?: string | null;
  inspectedAt?: string | null;
  createdAt: string;
  inspections: { checklistItemId: string; passed: boolean; note?: string | null }[];
}

export interface ConsumptionInput {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface InspectInput {
  approved: boolean;
  items: { checklistItemId: string; passed: boolean; note?: string }[];
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
