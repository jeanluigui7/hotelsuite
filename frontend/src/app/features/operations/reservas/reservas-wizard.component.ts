import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { Guest, Rate, RoomAttribute, RoomType } from '../../settings/catalogs/catalog.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { RoomMapItem, ReservationStatus } from '../services/operations.models';
import { ReservasStore } from './reservas-store.service';
import {
  MODALIDAD_LABEL,
  ORIGEN_LABEL,
  durationMinutesOf,
  representabilityBlockers,
  type Modalidad,
  type Origen,
  type Reserva,
  type ReservaEstado,
} from './reservas.model';

const PAY_METHODS = [
  { label: 'Efectivo', value: 'CASH' },
  { label: 'Tarjeta', value: 'CARD' },
  { label: 'Transferencia', value: 'TRANSFER' },
  { label: 'Billetera', value: 'WALLET' },
];

interface WHuesped {
  uid: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  nationality: string;
  phone: string;
}
interface WRoom {
  uid: string;
  roomTypeId: string | null;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  rateId: string | null;
  precio: number | null;
  adults: number;
  children: number;
  requisitos: string[];
  preferencias: string[];
  huespedes: WHuesped[];
}
interface WPago {
  id: string;
  importe: number;
  medio: string;
  destino: string;
  fecha: string;
  operacion: string;
  observacion: string;
}
interface WProg {
  id: string;
  vence: string;
  modo: 'FIJO' | 'PORCENTAJE';
  valor: number;
  base: 'TOTAL' | 'SALDO';
}

const uid = () => Math.random().toString(36).slice(2, 10);

@Component({
  selector: 'app-reservas-wizard',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    MultiSelectModule,
    TagModule,
  ],
  templateUrl: './reservas-wizard.component.html',
  styleUrls: ['./reservas.styles.scss', './reservas-wizard.component.scss'],
})
export class ReservasWizardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly store = inject(ReservasStore);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly step = signal(1);
  readonly steps = ['Estadía y habitaciones', 'Contacto y huéspedes', 'Pago y condiciones', 'Revisión'];

  mode: 'new' | 'edit' = 'new';
  editId: string | null = null;
  editingDemo = false;

  // Catálogos
  readonly roomTypes = signal<RoomType[]>([]);
  readonly attributes = signal<RoomAttribute[]>([]);
  readonly ratesByType = new Map<string, Rate[]>();
  readonly guestResults = signal<Guest[]>([]);
  readonly availability = signal<RoomMapItem[]>([]);
  availabilityChecked = false;
  guestSearch = '';

  // Estado del asistente
  codigo = this.store.nextCodigo();
  modalidad: Modalidad = 'PERNOCTE';
  entradaAt = '';
  salidaAt = '';
  rooms: WRoom[] = [this.emptyRoom()];
  cochera = { requiere: false, vehiculos: 1, estado: 'SOLICITADA' as 'SOLICITADA' | 'CONFIRMADA', precio: null as number | null, placasText: '' };
  contacto = {
    tipo: 'PERSONA' as 'PERSONA' | 'EMPRESA',
    guestId: null as string | null,
    documentType: 'DNI',
    documentNumber: '',
    nombre: '',
    telefono: '',
    telefonoAlt: '',
    email: '',
    seHospeda: false,
    hospedajeRoomUid: null as string | null,
  };
  origen: Origen = 'RECEPCION';
  comprobante: 'BOLETA' | 'FACTURA' | 'DESPUES' = 'DESPUES';
  comprobanteTitular = '';
  pagos: WPago[] = [];
  programados: WProg[] = [];
  condiciones = {
    politica: '',
    adelanto: null as number | null,
    plazo: '',
    venceTentativa: '',
    cancelacion: '',
    noShow: '',
    aceptacion: 'PENDIENTE' as 'PENDIENTE' | 'REGISTRADA',
  };
  notaInterna = '';
  observacionCliente = '';

  // Modales
  huespedDialog = false;
  huespedRoomUid: string | null = null;
  huespedForm: WHuesped = this.emptyHuesped();
  pagoDialog = false;
  pagoForm: WPago = this.emptyPago();
  progDialog = false;
  progForm: WProg = this.emptyProg();
  pendingVisible = false;
  pendingBlockers = signal<string[]>([]);
  private pendingReserva: Reserva | null = null;
  private pendingStatus: ReservaEstado = 'TENTATIVA';
  saving = signal(false);

  readonly modalidadOpts = (Object.keys(MODALIDAD_LABEL) as Modalidad[]).map((v) => ({ label: MODALIDAD_LABEL[v], value: v }));
  readonly origenOpts = Object.entries(ORIGEN_LABEL).map(([value, label]) => ({ label, value }));
  readonly payMethods = PAY_METHODS;
  readonly tipoOpts = [
    { label: 'Persona', value: 'PERSONA' },
    { label: 'Empresa', value: 'EMPRESA' },
  ];
  readonly docOpts = ['DNI', 'CE', 'PASAPORTE', 'RUC'].map((v) => ({ label: v, value: v }));
  readonly modoProgOpts = [
    { label: 'Monto fijo', value: 'FIJO' },
    { label: 'Porcentaje', value: 'PORCENTAJE' },
  ];
  readonly baseProgOpts = [
    { label: 'Total de reserva', value: 'TOTAL' },
    { label: 'Saldo', value: 'SALDO' },
  ];

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((r) => this.roomTypes.set(r.data ?? []));
    this.catalog.roomAttributes.list({ pageSize: 100, sortBy: 'name' }).subscribe((r) => this.attributes.set(r.data ?? []));
    this.catalog.rates.list({ pageSize: 300 }).subscribe((r) => {
      for (const rate of r.data ?? []) {
        const list = this.ratesByType.get(rate.roomTypeId) ?? [];
        list.push(rate);
        this.ratesByType.set(rate.roomTypeId, list);
      }
    });
    this.searchGuests();

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.mode = 'edit';
      this.editId = id;
      this.store.load();
      const r = this.store.byId(id);
      if (r) this.hydrate(r);
      else this.messages.add({ severity: 'warn', summary: 'Reserva no disponible', detail: 'Abre la edición desde la lista de reservas.' });
    } else {
      // Valores por defecto de fechas (hoy 14:00 → mañana 12:00)
      const now = new Date();
      now.setHours(14, 0, 0, 0);
      const out = new Date(now.getTime() + 22 * 3600000);
      this.entradaAt = this.toLocal(now);
      this.salidaAt = this.toLocal(out);
    }
  }

  // ── Helpers de fábrica ──
  emptyRoom(): WRoom {
    return { uid: uid(), roomTypeId: null, roomTypeName: '', roomId: null, roomNumber: null, rateId: null, precio: null, adults: 1, children: 0, requisitos: [], preferencias: [], huespedes: [] };
  }
  emptyHuesped(): WHuesped {
    return { uid: uid(), firstName: '', lastName: '', documentType: 'DNI', documentNumber: '', nationality: '', phone: '' };
  }
  emptyPago(): WPago {
    return { id: uid(), importe: 0, medio: 'CASH', destino: '', fecha: this.toLocal(new Date()), operacion: '', observacion: '' };
  }
  emptyProg(): WProg {
    return { id: uid(), vence: '', modo: 'PORCENTAJE', valor: 0, base: 'TOTAL' };
  }

  toLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ── Catálogos derivados ──
  roomTypeOpts() {
    return this.roomTypes().map((t) => ({ label: t.name, value: t.id }));
  }
  attrOpts() {
    return this.attributes().map((a) => ({ label: a.name, value: a.name }));
  }
  ratesFor(roomTypeId: string | null): Rate[] {
    if (!roomTypeId) return [];
    return this.ratesByType.get(roomTypeId) ?? [];
  }

  onRoomTypeChange(r: WRoom): void {
    const t = this.roomTypes().find((x) => x.id === r.roomTypeId);
    r.roomTypeName = t?.name ?? '';
    r.rateId = null;
    r.roomId = null;
    r.roomNumber = null;
  }
  onRateChange(r: WRoom): void {
    const rate = this.ratesFor(r.roomTypeId).find((x) => x.id === r.rateId);
    if (rate) r.precio = Number(rate.price);
  }

  addRoom(): void {
    this.rooms = [...this.rooms, this.emptyRoom()];
  }
  removeRoom(r: WRoom): void {
    this.rooms = this.rooms.filter((x) => x.uid !== r.uid);
    if (this.rooms.length === 0) this.rooms = [this.emptyRoom()];
  }

  duracionLabel(): string {
    if (!this.entradaAt || !this.salidaAt) return '—';
    const mins = durationMinutesOf(new Date(this.entradaAt).toISOString(), new Date(this.salidaAt).toISOString());
    if (mins >= 1440) {
      const noches = Math.round(mins / 1440);
      return `${noches} noche(s)`;
    }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m ? m + 'm' : ''}`.trim();
  }

  consultarDisponibilidad(): void {
    this.ops.map().subscribe((res) => {
      this.availability.set((res.data ?? []).filter((x) => x.status === 'FREE'));
      this.availabilityChecked = true;
      this.messages.add({ severity: 'info', summary: 'Disponibilidad aproximada', detail: 'Muestra habitaciones libres ahora. La validación real por fechas/atributos se conecta en una etapa posterior.' });
    });
  }
  freeRoomsFor(r: WRoom) {
    return this.availability().filter((x) => !r.roomTypeId || x.roomType.id === r.roomTypeId);
  }
  onAssignRoom(r: WRoom): void {
    const room = this.availability().find((x) => x.id === r.roomId);
    r.roomNumber = room?.number ?? null;
  }

  // ── Huéspedes ──
  openHuesped(roomUid: string): void {
    this.huespedRoomUid = roomUid;
    this.huespedForm = this.emptyHuesped();
    this.huespedDialog = true;
  }
  saveHuesped(): void {
    if (!this.huespedForm.firstName.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Falta el nombre', detail: 'Ingresa al menos el nombre del huésped.' });
      return;
    }
    const room = this.rooms.find((x) => x.uid === this.huespedRoomUid);
    if (room) room.huespedes = [...room.huespedes, { ...this.huespedForm }];
    this.huespedDialog = false;
  }
  removeHuesped(room: WRoom, h: WHuesped): void {
    room.huespedes = room.huespedes.filter((x) => x.uid !== h.uid);
  }

  // ── Cliente ──
  searchGuests(): void {
    this.catalog.guests.list({ pageSize: 20, search: this.guestSearch || undefined }).subscribe((r) => this.guestResults.set(r.data ?? []));
  }
  onGuestPick(): void {
    const g = this.guestResults().find((x) => x.id === this.contacto.guestId);
    if (g) {
      this.contacto.nombre = `${g.firstName} ${g.lastName ?? ''}`.trim();
      this.contacto.documentType = g.documentType;
      this.contacto.documentNumber = g.documentNumber;
      this.contacto.telefono = g.phone ?? '';
      this.contacto.email = g.email ?? '';
    }
  }

  // ── Pagos ──
  openPago(): void {
    this.pagoForm = this.emptyPago();
    this.pagoDialog = true;
  }
  savePago(): void {
    if (this.pagoForm.importe <= 0) {
      this.messages.add({ severity: 'warn', summary: 'Importe inválido', detail: 'El pago debe ser mayor a 0.' });
      return;
    }
    this.pagos = [...this.pagos, { ...this.pagoForm }];
    this.pagoDialog = false;
  }
  removePago(p: WPago): void {
    this.pagos = this.pagos.filter((x) => x.id !== p.id);
  }
  openProg(): void {
    this.progForm = this.emptyProg();
    this.progDialog = true;
  }
  saveProg(): void {
    this.programados = [...this.programados, { ...this.progForm }];
    this.progDialog = false;
  }
  removeProg(p: WProg): void {
    this.programados = this.programados.filter((x) => x.id !== p.id);
  }

  // ── Totales ──
  get totalVal(): number {
    const rooms = this.rooms.reduce((s, r) => s + (r.precio ?? 0), 0);
    const cochera = this.cochera.requiere ? this.cochera.precio ?? 0 : 0;
    return rooms + cochera;
  }
  get pagadoVal(): number {
    return this.pagos.reduce((s, p) => s + (p.importe ?? 0), 0);
  }
  get saldoVal(): number {
    return this.totalVal - this.pagadoVal;
  }
  progImporte(p: WProg): number {
    if (p.modo === 'FIJO') return p.valor;
    const base = p.base === 'TOTAL' ? this.totalVal : this.saldoVal;
    return Math.round(base * (p.valor / 100) * 100) / 100;
  }

  // ── Navegación de pasos ──
  next(): void {
    if (this.step() === 1 && !this.validateStep1()) return;
    if (this.step() < 4) this.step.set(this.step() + 1);
  }
  back(): void {
    if (this.step() > 1) this.step.set(this.step() - 1);
  }
  validateStep1(): boolean {
    if (!this.entradaAt || !this.salidaAt) {
      this.messages.add({ severity: 'warn', summary: 'Fechas incompletas', detail: 'Indica entrada y salida.' });
      return false;
    }
    if (new Date(this.salidaAt) <= new Date(this.entradaAt)) {
      this.messages.add({ severity: 'warn', summary: 'Rango inválido', detail: 'La salida debe ser posterior a la entrada.' });
      return false;
    }
    if (this.rooms.some((r) => !r.roomTypeId)) {
      this.messages.add({ severity: 'warn', summary: 'Falta tipo', detail: 'Cada habitación necesita un tipo.' });
      return false;
    }
    return true;
  }

  // ── Construcción del modelo rico ──
  buildReserva(estado: ReservaEstado): Reserva {
    const entradaISO = new Date(this.entradaAt).toISOString();
    const salidaISO = new Date(this.salidaAt).toISOString();
    const placas = this.cochera.placasText.split(',').map((s) => s.trim()).filter(Boolean);
    return {
      id: this.editId ?? 'tmp-' + uid(),
      codigo: this.codigo,
      estadoReserva: estado,
      estadoPago: this.pagadoVal <= 0 ? 'SIN_PAGO' : this.pagadoVal >= this.totalVal && this.totalVal > 0 ? 'PAGADO' : 'PARCIAL',
      estadoAsignacion: this.rooms.every((r) => r.roomId) ? 'ASIGNADA' : this.rooms.some((r) => r.roomId) ? 'PARCIAL' : 'SIN_ASIGNAR',
      modalidad: this.modalidad,
      entradaAt: entradaISO,
      salidaAt: salidaISO,
      contacto: {
        tipo: this.contacto.tipo,
        guestId: this.contacto.guestId,
        documentType: this.contacto.documentType,
        documentNumber: this.contacto.documentNumber,
        nombre: this.contacto.nombre,
        telefono: this.contacto.telefono,
        telefonoAlt: this.contacto.telefonoAlt,
        email: this.contacto.email,
        seHospeda: this.contacto.seHospeda,
        hospedajeRoomUid: this.contacto.hospedajeRoomUid,
      },
      habitaciones: this.rooms.map((r) => ({
        uid: r.uid,
        roomTypeId: r.roomTypeId,
        roomTypeName: r.roomTypeName,
        roomId: r.roomId,
        roomNumber: r.roomNumber,
        rateId: r.rateId,
        precio: r.precio,
        adults: r.adults,
        children: r.children,
        guestsCount: r.adults + r.children,
        requisitos: r.requisitos,
        preferencias: r.preferencias,
        huespedes: r.huespedes.map((h) => ({ uid: h.uid, firstName: h.firstName, lastName: h.lastName, documentType: h.documentType, documentNumber: h.documentNumber, nationality: h.nationality, phone: h.phone })),
        estadoUnidad: r.roomId ? 'ASIGNADA' : 'RESERVADA',
      })),
      cochera: { requiere: this.cochera.requiere, vehiculos: this.cochera.vehiculos, estado: this.cochera.estado, precio: this.cochera.precio, placas },
      origen: this.origen,
      total: this.totalVal || null,
      pagado: this.pagadoVal,
      saldo: this.totalVal ? this.saldoVal : null,
      pagos: this.pagos.map((p) => ({ id: p.id, importe: p.importe, medio: p.medio, destino: p.destino, fecha: new Date(p.fecha).toISOString(), operacion: p.operacion, observacion: p.observacion, tipo: 'RECIBIDO' as const })),
      pagosProgramados: this.programados.map((p) => ({ id: p.id, vence: p.vence ? new Date(p.vence).toISOString() : '', modo: p.modo, valor: p.valor, base: p.base, importeCalculado: this.progImporte(p) })),
      documentos: [],
      condiciones: {
        politicaNombre: this.condiciones.politica || null,
        adelantoRequerido: this.condiciones.adelanto,
        plazoPago: this.condiciones.plazo || null,
        venceTentativaAt: this.condiciones.venceTentativa ? new Date(this.condiciones.venceTentativa).toISOString() : null,
        cancelacion: this.condiciones.cancelacion || null,
        noShow: this.condiciones.noShow || null,
        aceptacion: this.condiciones.aceptacion,
      },
      notaInterna: this.notaInterna || null,
      observacionCliente: this.observacionCliente || null,
      createdAt: new Date().toISOString(),
      createdByName: this.auth.can('operations', 'create') ? 'Recepción' : null,
      origin: this.editingDemo ? 'DEMO' : 'REAL',
      persistencia: 'PENDIENTE_CONEXION',
    };
  }

  private hydrate(r: Reserva): void {
    this.codigo = r.codigo;
    this.editingDemo = r.origin === 'DEMO';
    this.modalidad = r.modalidad;
    this.entradaAt = this.toLocal(new Date(r.entradaAt));
    this.salidaAt = this.toLocal(new Date(r.salidaAt));
    this.rooms = r.habitaciones.map((h) => ({
      uid: h.uid,
      roomTypeId: h.roomTypeId,
      roomTypeName: h.roomTypeName ?? '',
      roomId: h.roomId ?? null,
      roomNumber: h.roomNumber ?? null,
      rateId: h.rateId ?? null,
      precio: h.precio ?? null,
      adults: h.adults ?? h.guestsCount ?? 1,
      children: h.children ?? 0,
      requisitos: [...h.requisitos],
      preferencias: [...h.preferencias],
      huespedes: h.huespedes.map((x) => ({ uid: x.uid, firstName: x.firstName, lastName: x.lastName ?? '', documentType: x.documentType ?? 'DNI', documentNumber: x.documentNumber ?? '', nationality: x.nationality ?? '', phone: x.phone ?? '' })),
    }));
    if (this.rooms.length === 0) this.rooms = [this.emptyRoom()];
    this.cochera = { requiere: r.cochera.requiere, vehiculos: r.cochera.vehiculos || 1, estado: r.cochera.estado, precio: r.cochera.precio ?? null, placasText: r.cochera.placas.join(', ') };
    this.contacto = {
      tipo: r.contacto.tipo,
      guestId: r.contacto.guestId ?? null,
      documentType: r.contacto.documentType ?? 'DNI',
      documentNumber: r.contacto.documentNumber ?? '',
      nombre: r.contacto.nombre,
      telefono: r.contacto.telefono ?? '',
      telefonoAlt: r.contacto.telefonoAlt ?? '',
      email: r.contacto.email ?? '',
      seHospeda: r.contacto.seHospeda ?? false,
      hospedajeRoomUid: r.contacto.hospedajeRoomUid ?? null,
    };
    this.origen = r.origen;
    this.pagos = r.pagos.map((p) => ({ id: p.id, importe: p.importe, medio: p.medio, destino: p.destino ?? '', fecha: this.toLocal(new Date(p.fecha)), operacion: p.operacion ?? '', observacion: p.observacion ?? '' }));
    this.programados = r.pagosProgramados.map((p) => ({ id: p.id, vence: p.vence ? this.toLocal(new Date(p.vence)) : '', modo: p.modo, valor: p.valor, base: p.base }));
    this.notaInterna = r.notaInterna ?? '';
    this.observacionCliente = r.observacionCliente ?? '';
  }

  // ── Guardado ──
  guardar(estado: 'TENTATIVA' | 'CONFIRMADA'): void {
    const reserva = this.buildReserva(estado);
    if (!reserva.contacto.nombre && !reserva.contacto.guestId) {
      this.messages.add({ severity: 'warn', summary: 'Falta el contacto', detail: 'Indica quién reserva (paso 2).' });
      this.step.set(2);
      return;
    }
    const blockers = representabilityBlockers(reserva);
    if (this.editingDemo || blockers.length) {
      this.pendingReserva = reserva;
      this.pendingStatus = estado;
      this.pendingBlockers.set(blockers);
      this.pendingVisible = true;
      return;
    }
    this.realSave(reserva, estado);
  }

  private realSave(reserva: Reserva, estado: 'TENTATIVA' | 'CONFIRMADA'): void {
    const h = reserva.habitaciones[0];
    const status: ReservationStatus = estado === 'CONFIRMADA' ? 'CONFIRMED' : 'PENDING';
    const dto = {
      roomTypeId: h.roomTypeId!,
      roomId: h.roomId ?? undefined,
      guestId: reserva.contacto.guestId ?? undefined,
      guestName: reserva.contacto.nombre || undefined,
      phone: reserva.contacto.telefono || undefined,
      expectedCheckInAt: reserva.entradaAt,
      durationMinutes: durationMinutesOf(reserva.entradaAt, reserva.salidaAt),
      adults: h.adults ?? 1,
      children: h.children ?? 0,
      status,
      notes: reserva.notaInterna || undefined,
    };
    this.saving.set(true);
    const req$ = this.mode === 'edit' && this.editId ? this.ops.reservations.update(this.editId, dto) : this.ops.reservations.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.store.setSource('REAL');
        this.messages.add({ severity: 'success', summary: estado === 'CONFIRMADA' ? 'Reserva confirmada' : 'Tentativa guardada', detail: 'Guardada en el sistema. El documento se genera en una etapa posterior.' });
        this.router.navigate(['/operations/reservas'], { queryParams: { vista: 'lista' } });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'No se guardó', detail: err.error?.error?.message ?? 'No se pudo guardar la reserva.' });
      },
    });
  }

  /** Confirmación del guardado pendiente: la única vía es la Demostración aislada. */
  guardarEnDemo(): void {
    if (!this.pendingReserva) return;
    const r = { ...this.pendingReserva, id: this.editId ?? 'demo-' + uid(), codigo: this.codigo };
    if (this.mode === 'edit' && this.editingDemo) this.store.updateDemoReserva(r);
    else this.store.addDemoReserva(r);
    this.pendingVisible = false;
    this.messages.add({ severity: 'info', summary: 'Guardado en Demostración', detail: 'No se tocó el backend ni la caja. Visible solo en Modo demostración.' });
    this.router.navigate(['/operations/reservas'], { queryParams: { vista: 'lista' } });
  }

  cancelar(): void {
    this.router.navigate(['/operations/reservas']);
  }

  modalidadLabel = MODALIDAD_LABEL;
  origenLabel = ORIGEN_LABEL;
}
