/**
 * Modelo de UI del módulo de Reservas (ETAPA 1 — base visual).
 *
 * Estas interfaces describen la operación COMPLETA (varias habitaciones, huéspedes
 * por habitación, pagos parciales, anticipos, cochera, documentos, condiciones) aunque
 * el backend actual solo persista una reserva simple. No se diseña alrededor de una
 * sola habitación: `Reserva.habitaciones` es siempre una lista.
 *
 * `origin` aísla los datos: 'REAL' proviene del endpoint; 'DEMO' es un dato de
 * demostración en memoria (nunca se guarda ni toca caja). `persistencia` indica si la
 * operación se puede guardar íntegra con el backend actual o queda pendiente de conexión.
 */
import type { Reservation, ReservationStatus } from '../services/operations.models';

export type ReservaEstado =
  | 'TENTATIVA'
  | 'CONFIRMADA'
  | 'EN_ESTADIA'
  | 'FINALIZADA'
  | 'CANCELADA'
  | 'VENCIDA'
  | 'NO_SHOW';

export type PagoEstado = 'SIN_PAGO' | 'PARCIAL' | 'PAGADO' | 'DESCONOCIDO';
export type AsignacionEstado = 'SIN_ASIGNAR' | 'PARCIAL' | 'ASIGNADA';
export type Modalidad = 'HORAS' | 'PERNOCTE';
export type Origen = 'RECEPCION' | 'WHATSAPP' | 'TELEFONO_FIJO' | 'CELULAR' | 'WEB' | 'OTA' | 'OTRO';
export type DataOrigin = 'REAL' | 'DEMO';
export type Persistencia = 'CONECTADO' | 'PENDIENTE_CONEXION';
export type UnidadEstado = 'RESERVADA' | 'ASIGNADA' | 'EN_ESTADIA' | 'FINALIZADA' | 'CANCELADA';

export interface Severity {
  label: string;
  severity: 'warn' | 'success' | 'danger' | 'secondary' | 'info' | 'contrast';
}

export const RESERVA_ESTADO_META: Record<ReservaEstado, Severity> = {
  TENTATIVA: { label: 'Tentativa', severity: 'warn' },
  CONFIRMADA: { label: 'Confirmada', severity: 'success' },
  EN_ESTADIA: { label: 'En estadía', severity: 'info' },
  FINALIZADA: { label: 'Finalizada', severity: 'secondary' },
  CANCELADA: { label: 'Cancelada', severity: 'danger' },
  VENCIDA: { label: 'Vencida', severity: 'contrast' },
  NO_SHOW: { label: 'No se presentó', severity: 'danger' },
};

export const PAGO_ESTADO_META: Record<PagoEstado, Severity> = {
  SIN_PAGO: { label: 'Sin pago', severity: 'secondary' },
  PARCIAL: { label: 'Pago parcial', severity: 'warn' },
  PAGADO: { label: 'Pagado', severity: 'success' },
  DESCONOCIDO: { label: 'Sin conexión', severity: 'contrast' },
};

export const ASIGNACION_META: Record<AsignacionEstado, Severity> = {
  SIN_ASIGNAR: { label: 'Sin asignar', severity: 'warn' },
  PARCIAL: { label: 'Parcialmente asignada', severity: 'info' },
  ASIGNADA: { label: 'Asignada', severity: 'success' },
};

export const ORIGEN_LABEL: Record<Origen, string> = {
  RECEPCION: 'Recepción',
  WHATSAPP: 'WhatsApp',
  TELEFONO_FIJO: 'Teléfono fijo',
  CELULAR: 'Celular',
  WEB: 'Web',
  OTA: 'OTA',
  OTRO: 'Otro',
};

export const MODALIDAD_LABEL: Record<Modalidad, string> = {
  HORAS: 'Por horas',
  PERNOCTE: 'Pernoctación',
};

export interface ReservaHuesped {
  uid: string;
  firstName: string;
  lastName?: string;
  documentType?: string;
  documentNumber?: string;
  nationality?: string;
  phone?: string;
  /** Datos de identificación pendientes (se exigen antes del check-in). */
  pendiente?: boolean;
}

export interface ReservaHabitacion {
  /** Id local de la unidad solicitada (cada habitación pedida es una unidad). */
  uid: string;
  roomTypeId: string | null;
  roomTypeName?: string | null;
  /** Número asignado, o null = "Por asignar". */
  roomId?: string | null;
  roomNumber?: string | null;
  rateId?: string | null;
  rateLabel?: string | null;
  precio?: number | null;
  guestsCount: number;
  adults?: number;
  children?: number;
  /** Atributos obligatorios (requisitos) vs. preferencias (deseables). */
  requisitos: string[];
  preferencias: string[];
  huespedes: ReservaHuesped[];
  estadoUnidad: UnidadEstado;
}

export interface ReservaCochera {
  requiere: boolean;
  vehiculos: number;
  estado: 'SOLICITADA' | 'CONFIRMADA';
  precio?: number | null;
  placas: string[];
}

export interface ReservaContacto {
  tipo: 'PERSONA' | 'EMPRESA';
  guestId?: string | null;
  documentType?: string;
  documentNumber?: string;
  nombre: string;
  telefono?: string;
  telefonoAlt?: string;
  email?: string;
  /** La persona que reserva también se hospeda (y en qué unidad). */
  seHospeda?: boolean;
  hospedajeRoomUid?: string | null;
}

export interface ReservaPago {
  id: string;
  importe: number;
  medio: string;
  destino?: string;
  fecha: string;
  operacion?: string;
  observacion?: string;
  tipo: 'RECIBIDO' | 'ANTICIPO_APLICADO';
}

export interface ReservaPagoProgramado {
  id: string;
  vence: string;
  modo: 'FIJO' | 'PORCENTAJE';
  valor: number;
  base: 'TOTAL' | 'SALDO';
  importeCalculado: number;
}

export interface ReservaDocumento {
  id: string;
  tipo: 'TENTATIVA' | 'CONFIRMACION';
  version: number;
  emitidoAt: string;
  vigente: boolean;
}

export interface ReservaCondiciones {
  politicaNombre?: string | null;
  politicaVersion?: string | null;
  adelantoRequerido?: number | null;
  plazoPago?: string | null;
  venceTentativaAt?: string | null;
  cancelacion?: string | null;
  noShow?: string | null;
  aceptacion: 'PENDIENTE' | 'REGISTRADA';
  aceptacionAt?: string | null;
}

export interface Reserva {
  id: string;
  codigo: string; // R-0158
  estadoReserva: ReservaEstado;
  estadoPago: PagoEstado;
  estadoAsignacion: AsignacionEstado;
  modalidad: Modalidad;
  entradaAt: string;
  salidaAt: string;
  contacto: ReservaContacto;
  habitaciones: ReservaHabitacion[];
  cochera: ReservaCochera;
  origen: Origen;
  total: number | null;
  pagado: number | null;
  saldo: number | null;
  pagos: ReservaPago[];
  pagosProgramados: ReservaPagoProgramado[];
  documentos: ReservaDocumento[];
  condiciones: ReservaCondiciones;
  notaInterna?: string | null;
  observacionCliente?: string | null;
  createdAt: string;
  createdByName?: string | null;
  // Aislamiento y honestidad del guardado:
  origin: DataOrigin;
  persistencia: Persistencia;
}

export interface Proforma {
  id: string;
  codigo: string; // P-0042
  cliente: string;
  fecha: string;
  validezAt: string;
  habitaciones: number;
  total: number | null;
  estado: 'VIGENTE' | 'VENCIDA' | 'CONVERTIDA';
  origin: DataOrigin;
}

export interface Anticipo {
  id: string;
  codigo: string; // A-0007
  cliente: string;
  telefono?: string;
  fecha: string;
  recibido: number;
  aplicado: number;
  disponible: number;
  estado: 'POR_APLICAR' | 'PARCIAL' | 'APLICADO';
  origin: DataOrigin;
}

/** Cuerpo que el asistente envía al backend (ETAPA 2). */
export interface ReservaApiInput {
  codigo?: string | null;
  estado: 'TENTATIVA' | 'CONFIRMADA';
  modalidad: Modalidad;
  entradaAt: string;
  salidaAt: string;
  origen: Origen;
  contacto: {
    tipo: 'PERSONA' | 'EMPRESA';
    guestId?: string | null;
    documentType?: string | null;
    documentNumber?: string | null;
    nombre?: string | null;
    telefono?: string | null;
    telefonoAlt?: string | null;
    email?: string | null;
  };
  habitaciones: {
    roomTypeId: string;
    roomTypeName?: string | null;
    roomId?: string | null;
    rateId?: string | null;
    precio?: number | null;
    adults: number;
    children: number;
    requisitos: string[];
    preferencias: string[];
    huespedes: { guestId?: string | null; firstName: string; lastName?: string | null; documentType?: string | null; documentNumber?: string | null; nationality?: string | null; phone?: string | null }[];
  }[];
  cochera?: { requiere: boolean; vehiculos: number; estado: 'SOLICITADA' | 'CONFIRMADA'; precio?: number | null; placas: string[] };
  pagos: { importe: number; medio: string; destino?: string | null; operacion?: string | null; observacion?: string | null; fecha?: string }[];
  pagosProgramados: { vence?: string | null; modo: 'FIJO' | 'PORCENTAJE'; valor: number; base: 'TOTAL' | 'SALDO' }[];
  condiciones?: {
    politicaNombre?: string | null;
    politicaVersion?: string | null;
    adelantoRequerido?: number | null;
    plazoPago?: string | null;
    venceTentativaAt?: string | null;
    cancelacion?: string | null;
    noShow?: string | null;
    aceptacion: 'PENDIENTE' | 'REGISTRADA';
  };
  notaInterna?: string | null;
  observacionCliente?: string | null;
}

// ── Disponibilidad (ETAPA 2 · 2B) ──
export interface AvailabilityRoom {
  id: string;
  number: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string | null;
  available: boolean;
  reason?: string;
  conflictFrom?: string;
  conflictTo?: string;
  latestCheckIn?: string;
}
export interface AvailabilityResult {
  from: string;
  to: string;
  prepMin: number;
  rooms: AvailabilityRoom[];
  availableCount: number;
  parking: { capacity: number | null; used: number; requested: number; available: number | null; ok: boolean };
}

// ── Mapeo del backend actual (reserva simple) → modelo rico ──

const ESTADO_FROM_API: Record<ReservationStatus, ReservaEstado> = {
  PENDING: 'TENTATIVA',
  CONFIRMED: 'CONFIRMADA',
  FULFILLED: 'FINALIZADA',
  CANCELLED: 'CANCELADA',
};

/** Convierte una reserva real (1 habitación, sin pagos) al modelo de UI, marcando
 *  explícitamente lo que el backend actual no conoce (pagos/saldo → DESCONOCIDO). */
export function reservaFromApi(r: Reservation, index: number): Reserva {
  const salida = new Date(new Date(r.expectedCheckInAt).getTime() + (r.durationMinutes || 1440) * 60000);
  const asignada = !!r.room?.id;
  return {
    id: r.id,
    codigo: `R-${String(index + 1).padStart(4, '0')}`,
    estadoReserva: ESTADO_FROM_API[r.status] ?? 'TENTATIVA',
    estadoPago: 'DESCONOCIDO',
    estadoAsignacion: asignada ? 'ASIGNADA' : 'SIN_ASIGNAR',
    modalidad: (r.durationMinutes || 1440) >= 1440 ? 'PERNOCTE' : 'HORAS',
    entradaAt: r.expectedCheckInAt,
    salidaAt: salida.toISOString(),
    contacto: {
      tipo: 'PERSONA',
      guestId: r.guestId ?? null,
      nombre: r.guestName ?? 'Cliente',
      telefono: r.phone ?? undefined,
    },
    habitaciones: [
      {
        uid: `${r.id}-1`,
        roomTypeId: r.roomType.id,
        roomTypeName: r.roomType.name,
        roomId: r.room?.id ?? null,
        roomNumber: r.room?.number ?? null,
        guestsCount: (r.adults || 1) + (r.children || 0),
        requisitos: [],
        preferencias: [],
        huespedes: [],
        estadoUnidad: asignada ? 'ASIGNADA' : 'RESERVADA',
        precio: null,
      },
    ],
    cochera: { requiere: false, vehiculos: 0, estado: 'SOLICITADA', placas: [] },
    origen: 'RECEPCION',
    total: null,
    pagado: null,
    saldo: null,
    pagos: [],
    pagosProgramados: [],
    documentos: [],
    condiciones: { aceptacion: 'PENDIENTE' },
    notaInterna: r.notes ?? null,
    observacionCliente: null,
    createdAt: r.expectedCheckInAt,
    createdByName: null,
    origin: 'REAL',
    persistencia: 'CONECTADO',
  };
}

/**
 * Lista de campos de la operación que el backend actual NO puede conservar, por lo que
 * un guardado real descartaría datos. Si devuelve algo, el guardado queda "pendiente de
 * conexión" (no se guarda parcial ni en silencio). Vacío = representable con el endpoint.
 */
export function representabilityBlockers(r: Reserva): string[] {
  const b: string[] = [];
  if (r.habitaciones.length !== 1) b.push('Más de una habitación');
  const h = r.habitaciones[0];
  if (h) {
    if (!h.roomTypeId) b.push('Tipo de habitación sin definir');
    if (h.requisitos.length || h.preferencias.length) b.push('Requisitos/preferencias de habitación');
    if (h.huespedes.length > 0) b.push('Huéspedes detallados por habitación');
  }
  if (r.cochera.requiere) b.push('Cochera');
  if (r.pagos.length) b.push('Pagos recibidos');
  if (r.pagosProgramados.length) b.push('Pagos programados');
  if (r.contacto.tipo === 'EMPRESA') b.push('Datos de empresa');
  if (r.contacto.email) b.push('Correo del contacto');
  if (r.contacto.telefonoAlt) b.push('Teléfono adicional');
  if (r.origen !== 'RECEPCION') b.push('Origen distinto de Recepción');
  if (r.observacionCliente) b.push('Observación visible al cliente');
  return b;
}

/** Duración en minutos entre entrada y salida (mínimo 1). */
export function durationMinutesOf(entradaAt: string, salidaAt: string): number {
  const mins = Math.round((new Date(salidaAt).getTime() - new Date(entradaAt).getTime()) / 60000);
  return Math.max(1, mins);
}

/** Resumen "N de M habitaciones …" para listas y tarjetas. */
export function habitacionesResumen(res: Reserva): { total: number; asignadas: number; tipos: string } {
  const total = res.habitaciones.length;
  const asignadas = res.habitaciones.filter((h) => !!h.roomId).length;
  const tipos = [...new Set(res.habitaciones.map((h) => h.roomTypeName || 'Tipo'))].join(', ');
  return { total, asignadas, tipos };
}
