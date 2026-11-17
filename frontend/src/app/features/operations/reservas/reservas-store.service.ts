/**
 * Store del módulo de Reservas (ETAPA 1).
 *
 * Mantiene dos fuentes AISLADAS:
 *  - REAL: reservas que vienen del endpoint `/reservations` (mapeadas al modelo rico).
 *          El backend actual solo persiste una reserva simple, así que los campos que no
 *          conoce (pagos/saldo/multi-habitación) se muestran como "pendiente de conexión".
 *  - DEMO: un conjunto de datos de demostración en memoria, sellado `DEMO`, que permite
 *          recorrer los flujos aún no conectados SIN generar reservas ni mover caja reales.
 *
 * Cambiar de fuente nunca escribe en el backend. El guardado real se hará en tandas
 * posteriores y solo cuando pueda conservar toda la operación.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { OperationsApiService } from '../services/operations-api.service';
import {
  reservaFromApi,
  type Anticipo,
  type DataOrigin,
  type Proforma,
  type Reserva,
} from './reservas.model';

export interface Indicador {
  key: string;
  label: string;
  value: number | null;
  /** Si el backend actual no puede calcularlo con datos reales. */
  pendiente: boolean;
  hint?: string;
}

@Injectable({ providedIn: 'root' })
export class ReservasStore {
  private readonly ops = inject(OperationsApiService);

  readonly source = signal<DataOrigin>('REAL');
  readonly loading = signal(false);

  private readonly realReservas = signal<Reserva[]>([]);
  private readonly demoReservas = signal<Reserva[]>([]);
  private readonly demoProformasData = signal<Proforma[]>([]);
  private readonly demoAnticiposData = signal<Anticipo[]>([]);

  /** Reservas de la fuente activa. */
  readonly reservas = computed<Reserva[]>(() =>
    this.source() === 'DEMO' ? this.demoReservas() : this.realReservas(),
  );
  /** Proformas/Anticipos solo existen en demostración por ahora (backend pendiente). */
  readonly proformas = computed<Proforma[]>(() => (this.source() === 'DEMO' ? this.demoProformasData() : []));
  readonly anticipos = computed<Anticipo[]>(() => (this.source() === 'DEMO' ? this.demoAnticiposData() : []));

  readonly isDemo = computed(() => this.source() === 'DEMO');

  /** Indicadores de la cabecera. Marca `pendiente` lo que aún no se puede calcular real. */
  readonly indicadores = computed<Indicador[]>(() => {
    const list = this.reservas();
    const now = new Date();
    const sameDay = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    };
    const activas = list.filter((r) => r.estadoReserva === 'TENTATIVA' || r.estadoReserva === 'CONFIRMADA');
    const llegadasHoy = activas.filter((r) => sameDay(r.entradaAt)).length;
    const sinAsignar = activas.filter((r) => r.estadoAsignacion !== 'ASIGNADA').length;
    const demo = this.isDemo();
    // Tentativas por vencer y saldo pendiente requieren venceTentativaAt / saldo: solo real en demo.
    const porVencer = activas.filter(
      (r) => r.estadoReserva === 'TENTATIVA' && r.condiciones.venceTentativaAt,
    ).length;
    const conSaldo = list.filter((r) => (r.saldo ?? 0) > 0).length;
    return [
      { key: 'llegadas', label: 'Llegadas de hoy', value: llegadasHoy, pendiente: false },
      {
        key: 'porVencer',
        label: 'Tentativas por vencer',
        value: demo ? porVencer : null,
        pendiente: !demo,
        hint: demo ? undefined : 'Requiere vencimiento de tentativa (conexión pendiente).',
      },
      { key: 'sinAsignar', label: 'Hab. pendientes de asignación', value: sinAsignar, pendiente: false },
      {
        key: 'saldo',
        label: 'Reservas con saldo pendiente',
        value: demo ? conSaldo : null,
        pendiente: !demo,
        hint: demo ? undefined : 'Requiere pagos de reserva (conexión pendiente).',
      },
    ];
  });

  setSource(s: DataOrigin): void {
    this.source.set(s);
    if (s === 'DEMO' && this.demoReservas().length === 0) this.seedDemo();
    if (s === 'REAL') this.loadReal();
  }

  load(): void {
    if (this.source() === 'DEMO') {
      if (this.demoReservas().length === 0) this.seedDemo();
    } else {
      this.loadReal();
    }
  }

  private loadReal(): void {
    this.loading.set(true);
    this.ops.reservations
      .list({ pageSize: 200, sortBy: 'expectedCheckInAt', sortDir: 'desc' })
      .subscribe({
        next: (res) => {
          const items = (res.data ?? []).map((r, i) => reservaFromApi(r, i));
          this.realReservas.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.realReservas.set([]);
          this.loading.set(false);
        },
      });
  }

  byId(id: string): Reserva | undefined {
    return this.reservas().find((r) => r.id === id) ?? this.demoReservas().find((r) => r.id === id) ?? this.realReservas().find((r) => r.id === id);
  }

  /** Siguiente código correlativo R-#### sobre la fuente activa (solo presentación). */
  nextCodigo(): string {
    const n = this.reservas().length + 1;
    return `R-${String(n).padStart(4, '0')}`;
  }

  /** Guarda una reserva SOLO en la demostración aislada (nunca toca backend ni caja). */
  addDemoReserva(r: Reserva): void {
    if (this.demoReservas().length === 0) this.seedDemo();
    this.demoReservas.update((list) => [{ ...r, origin: 'DEMO', persistencia: 'PENDIENTE_CONEXION' }, ...list]);
    this.source.set('DEMO');
  }

  /** Reemplaza una reserva de la demostración por su versión editada. */
  updateDemoReserva(r: Reserva): void {
    this.demoReservas.update((list) => list.map((x) => (x.id === r.id ? { ...r, origin: 'DEMO' } : x)));
    this.source.set('DEMO');
  }

  /** Recalcula estado de pago y saldo a partir de total/pagos. */
  private recompute(r: Reserva): Reserva {
    const pagado = r.pagos.reduce((s, p) => s + (p.importe ?? 0), 0);
    const total = r.total ?? 0;
    const estadoPago = pagado <= 0 ? 'SIN_PAGO' : total > 0 && pagado >= total ? 'PAGADO' : 'PARCIAL';
    return { ...r, pagado, saldo: r.total === null ? null : total - pagado, estadoPago };
  }

  private mutateDemo(id: string, fn: (r: Reserva) => Reserva): void {
    this.demoReservas.update((list) => list.map((x) => (x.id === id ? this.recompute(fn(x)) : x)));
  }

  /** Cambia el estado de una reserva de demostración (confirmar / no-show / cancelar). */
  setEstadoDemo(id: string, estado: Reserva['estadoReserva']): void {
    this.mutateDemo(id, (r) => ({ ...r, estadoReserva: estado }));
  }

  /** Agrega un pago recibido a una reserva de demostración. */
  addPagoDemo(id: string, pago: Reserva['pagos'][number]): void {
    this.mutateDemo(id, (r) => ({ ...r, pagos: [...r.pagos, pago] }));
  }

  /** Cancela (total o por habitaciones) una reserva de demostración sin borrarla. */
  cancelDemo(id: string, habUids: string[] | null): void {
    this.mutateDemo(id, (r) => {
      if (!habUids || habUids.length === 0 || habUids.length === r.habitaciones.length) {
        return { ...r, estadoReserva: 'CANCELADA', habitaciones: r.habitaciones.map((h) => ({ ...h, estadoUnidad: 'CANCELADA' })) };
      }
      return { ...r, habitaciones: r.habitaciones.map((h) => (habUids.includes(h.uid) ? { ...h, estadoUnidad: 'CANCELADA' } : h)) };
    });
  }

  // ── Anticipos (demostración) ──
  addDemoAnticipo(a: Anticipo): void {
    if (this.demoAnticiposData().length === 0) this.seedDemo();
    this.demoAnticiposData.update((list) => [{ ...a, origin: 'DEMO' }, ...list]);
    this.source.set('DEMO');
  }

  /** Aplica parte de un anticipo a una reserva (no genera segundo ingreso en caja). */
  applyDemoAnticipo(anticipoId: string, reservaId: string, importe: number): void {
    this.demoAnticiposData.update((list) =>
      list.map((a) => {
        if (a.id !== anticipoId) return a;
        const aplicado = a.aplicado + importe;
        const disponible = Math.max(0, a.recibido - aplicado);
        return { ...a, aplicado, disponible, estado: disponible <= 0 ? 'APLICADO' : 'PARCIAL' };
      }),
    );
    this.addPagoDemo(reservaId, { id: Math.random().toString(36).slice(2, 10), importe, medio: 'Anticipo', fecha: new Date().toISOString(), tipo: 'ANTICIPO_APLICADO' });
  }

  // ── Datos de demostración (aislados, sello DEMO) ──
  private seedDemo(): void {
    const now = Date.now();
    const d = (daysFromNow: number, hour = 14, min = 0): string => {
      const date = new Date(now + daysFromNow * 86400000);
      date.setHours(hour, min, 0, 0);
      return date.toISOString();
    };
    const mk = (p: Partial<Reserva> & Pick<Reserva, 'id' | 'codigo'>): Reserva => ({
      estadoReserva: 'TENTATIVA',
      estadoPago: 'SIN_PAGO',
      estadoAsignacion: 'SIN_ASIGNAR',
      modalidad: 'PERNOCTE',
      entradaAt: d(1),
      salidaAt: d(2),
      contacto: { tipo: 'PERSONA', nombre: 'Cliente demo' },
      habitaciones: [],
      cochera: { requiere: false, vehiculos: 0, estado: 'SOLICITADA', placas: [] },
      origen: 'RECEPCION',
      total: null,
      pagado: null,
      saldo: null,
      pagos: [],
      pagosProgramados: [],
      documentos: [],
      condiciones: { aceptacion: 'PENDIENTE' },
      createdAt: d(0),
      createdByName: 'Demostración',
      origin: 'DEMO',
      persistencia: 'PENDIENTE_CONEXION',
      ...p,
    });

    this.demoReservas.set([
      mk({
        id: 'demo-1',
        codigo: 'R-0158',
        estadoReserva: 'TENTATIVA',
        estadoPago: 'PARCIAL',
        estadoAsignacion: 'SIN_ASIGNAR',
        entradaAt: d(0, 15),
        salidaAt: d(1, 12),
        contacto: { tipo: 'PERSONA', nombre: 'María Fernández', telefono: '+51 987 654 321' },
        habitaciones: [
          { uid: 'h1', roomTypeId: null, roomTypeName: 'Matrimonial', roomId: null, roomNumber: null, guestsCount: 2, requisitos: ['Ventana a la calle'], preferencias: ['Piso bajo'], huespedes: [], estadoUnidad: 'RESERVADA', precio: 120 },
        ],
        origen: 'WHATSAPP',
        total: 120,
        pagado: 30,
        saldo: 90,
        condiciones: { aceptacion: 'PENDIENTE', venceTentativaAt: d(0, 18), adelantoRequerido: 30 },
        pagos: [{ id: 'p1', importe: 30, medio: 'Efectivo', fecha: d(0, 15), tipo: 'RECIBIDO' }],
        pagosProgramados: [{ id: 'pp1', vence: d(39), modo: 'PORCENTAJE', valor: 33, base: 'TOTAL', importeCalculado: 40 }],
      }),
      mk({
        id: 'demo-2',
        codigo: 'R-0159',
        estadoReserva: 'CONFIRMADA',
        estadoPago: 'PARCIAL',
        estadoAsignacion: 'PARCIAL',
        entradaAt: d(2, 14),
        salidaAt: d(4, 12),
        contacto: { tipo: 'EMPRESA', nombre: 'Minera Andes S.A.', telefono: '+51 11 2345678' },
        habitaciones: [
          { uid: 'h1', roomTypeId: null, roomTypeName: 'Simple', roomId: 'r-201', roomNumber: '201', guestsCount: 1, requisitos: [], preferencias: ['Piso alto'], huespedes: [], estadoUnidad: 'ASIGNADA', precio: 90 },
          { uid: 'h2', roomTypeId: null, roomTypeName: 'Simple', roomId: null, roomNumber: null, guestsCount: 1, requisitos: [], preferencias: [], huespedes: [], estadoUnidad: 'RESERVADA', precio: 90 },
          { uid: 'h3', roomTypeId: null, roomTypeName: 'Matrimonial', roomId: null, roomNumber: null, guestsCount: 2, requisitos: ['Ventana a la calle'], preferencias: [], huespedes: [], estadoUnidad: 'RESERVADA', precio: 130 },
        ],
        origen: 'OTA',
        total: 620,
        pagado: 200,
        saldo: 420,
        cochera: { requiere: true, vehiculos: 2, estado: 'CONFIRMADA', precio: 20, placas: ['ABC-123'] },
        condiciones: { aceptacion: 'REGISTRADA', politicaNombre: 'Estándar corporativa', politicaVersion: 'v2' },
        pagos: [{ id: 'p1', importe: 200, medio: 'Transferencia', fecha: d(-1, 10), tipo: 'RECIBIDO' }],
      }),
      mk({
        id: 'demo-3',
        codigo: 'R-0160',
        estadoReserva: 'VENCIDA',
        estadoPago: 'SIN_PAGO',
        entradaAt: d(-1, 16),
        salidaAt: d(0, 12),
        contacto: { tipo: 'PERSONA', nombre: 'Jorge Ramos', telefono: '+51 999 111 222' },
        habitaciones: [
          { uid: 'h1', roomTypeId: null, roomTypeName: 'Matrimonial', roomId: null, roomNumber: null, guestsCount: 2, requisitos: [], preferencias: [], huespedes: [], estadoUnidad: 'RESERVADA', precio: 130 },
        ],
        origen: 'WEB',
        total: 130,
        pagado: 0,
        saldo: 130,
        condiciones: { aceptacion: 'PENDIENTE', venceTentativaAt: d(-1, 18) },
      }),
    ]);

    this.demoProformasData.set([
      { id: 'pf-1', codigo: 'P-0042', cliente: 'Eventos del Sur', fecha: d(-2), validezAt: d(5), habitaciones: 4, total: 1800, estado: 'VIGENTE', origin: 'DEMO' },
      { id: 'pf-2', codigo: 'P-0041', cliente: 'Luis Peña', fecha: d(-10), validezAt: d(-3), habitaciones: 1, total: 150, estado: 'VENCIDA', origin: 'DEMO' },
    ]);

    this.demoAnticiposData.set([
      { id: 'an-1', codigo: 'A-0007', cliente: 'Carla Soto', telefono: '+51 955 333 444', fecha: d(-5), recibido: 100, aplicado: 60, disponible: 40, estado: 'PARCIAL', origin: 'DEMO' },
      { id: 'an-2', codigo: 'A-0006', cliente: 'Grupo Lima', fecha: d(-8), recibido: 300, aplicado: 0, disponible: 300, estado: 'POR_APLICAR', origin: 'DEMO' },
    ]);
  }
}
