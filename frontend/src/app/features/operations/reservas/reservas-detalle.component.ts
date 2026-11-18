import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MenuModule } from 'primeng/menu';
import type { MenuItem } from 'primeng/api';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { RoomMapItem } from '../services/operations.models';
import { CheckInDialogComponent } from '../habitaciones/check-in-dialog.component';
import { ReservasDocumentoComponent } from './reservas-documento.component';
import { ReservasStore } from './reservas-store.service';
import {
  ASIGNACION_META,
  MODALIDAD_LABEL,
  ORIGEN_LABEL,
  PAGO_ESTADO_META,
  RESERVA_ESTADO_META,
  habitacionesResumen,
  type Reserva,
} from './reservas.model';

type Tab = 'resumen' | 'habitaciones' | 'pagos' | 'documentos' | 'historial';

@Component({
  selector: 'app-reservas-detalle',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TagModule,
    MenuModule,
    CheckInDialogComponent,
    ReservasDocumentoComponent,
  ],
  templateUrl: './reservas-detalle.component.html',
  styleUrls: ['./reservas.styles.scss', './reservas-detalle.component.scss'],
})
export class ReservasDetalleComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(ReservasStore);
  private readonly ops = inject(OperationsApiService);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly reserva = signal<Reserva | null>(null);
  readonly tab = signal<Tab>('resumen');
  id = '';

  readonly estadoMeta = RESERVA_ESTADO_META;
  readonly pagoMeta = PAGO_ESTADO_META;
  readonly asignMeta = ASIGNACION_META;
  readonly origenLabel = ORIGEN_LABEL;
  readonly modalidadLabel = MODALIDAD_LABEL;
  resumen = habitacionesResumen;

  readonly canEdit = this.auth.can('operations', 'edit');

  // Modales
  pagoDialog = false;
  pagoForm = { importe: 0, medio: 'CASH', destino: '', fecha: '', operacion: '', observacion: '' };
  cancelDialog = false;
  cancelMode: 'TOTAL' | 'PARCIAL' = 'TOTAL';
  cancelHabs: string[] = [];
  cancelMotivo = '';
  prepDialog = false;
  prepRooms = signal<{ hab: Reserva['habitaciones'][number]; selected: boolean; mapRoom: RoomMapItem | null }[]>([]);
  checkInVisible = false;
  checkInRoom: RoomMapItem | null = null;
  checkInGuestId: string | null = null;
  docVisible = false;
  docTipo: 'TENTATIVA' | 'CONFIRMACION' = 'TENTATIVA';
  saving = signal(false);

  readonly payMethods = [
    { label: 'Efectivo', value: 'CASH' },
    { label: 'Tarjeta', value: 'CARD' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Billetera', value: 'WALLET' },
  ];

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.store.load();
    this.refresh();
    if (!this.reserva()) {
      // Reintenta tras cargar la fuente real.
      setTimeout(() => this.refresh(), 400);
    }
    const accion = this.route.snapshot.queryParamMap.get('accion');
    if (accion) setTimeout(() => this.runAccion(accion), 500);
    if (this.route.snapshot.queryParamMap.get('doc')) setTimeout(() => this.abrirDoc(), 500);
  }

  abrirDoc(tipo?: 'TENTATIVA' | 'CONFIRMACION'): void {
    const r = this.reserva();
    if (!r) return;
    this.docTipo = tipo ?? (r.estadoReserva === 'CONFIRMADA' || r.estadoReserva === 'EN_ESTADIA' ? 'CONFIRMACION' : 'TENTATIVA');
    this.docVisible = true;
  }

  refresh(): void {
    const local = this.store.byId(this.id);
    if (local && local.origin === 'DEMO') {
      this.reserva.set(local);
      return;
    }
    // Reserva real: traer el detalle completo (habitaciones, huéspedes, pagos).
    this.ops.reservationGet(this.id).subscribe({
      next: (res) => this.reserva.set((res.data as Reserva) ?? local ?? null),
      error: () => this.reserva.set(local ?? null),
    });
  }

  isDemo(): boolean {
    return this.reserva()?.origin === 'DEMO';
  }

  runAccion(a: string): void {
    if (!this.reserva()) return;
    if (a === 'pago') this.openPago();
    else if (a === 'cancelar') this.openCancel();
    else if (a === 'checkin') this.openPrep();
  }

  moreItems(): MenuItem[] {
    const r = this.reserva();
    if (!r) return [];
    const items: MenuItem[] = [];
    if (r.estadoReserva === 'TENTATIVA') items.push({ label: 'Confirmar tentativa', icon: 'pi pi-check-circle', command: () => this.confirmar() });
    if (r.estadoReserva === 'TENTATIVA' || r.estadoReserva === 'CONFIRMADA') {
      items.push({ label: 'Cancelar reserva', icon: 'pi pi-times-circle', command: () => this.openCancel() });
      items.push({ label: 'Registrar no presentación', icon: 'pi pi-user-minus', command: () => this.noShow() });
    }
    return items;
  }

  // ── Estado ──
  confirmar(): void {
    const r = this.reserva();
    if (!r) return;
    if (r.origin === 'DEMO') {
      this.store.setEstadoDemo(r.id, 'CONFIRMADA');
      this.refresh();
      this.messages.add({ severity: 'success', summary: 'Confirmada', detail: 'Tentativa confirmada (demostración).' });
      return;
    }
    this.saving.set(true);
    this.ops.reservationStatus(r.id, { estado: 'CONFIRMADA' }).subscribe({
      next: () => { this.saving.set(false); this.messages.add({ severity: 'success', summary: 'Confirmada', detail: 'Reserva confirmada.' }); this.refresh(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo confirmar.' }); },
    });
  }

  noShow(): void {
    const r = this.reserva();
    if (!r) return;
    if (r.origin === 'DEMO') {
      this.store.setEstadoDemo(r.id, 'NO_SHOW');
      this.refresh();
      this.messages.add({ severity: 'info', summary: 'No presentación', detail: 'Registrada (demostración).' });
      return;
    }
    this.ops.reservationStatus(r.id, { estado: 'NO_SHOW' }).subscribe({
      next: () => { this.messages.add({ severity: 'info', summary: 'No presentación', detail: 'Registrada.' }); this.refresh(); },
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo registrar.' }),
    });
  }

  // ── Pago ──
  openPago(): void {
    this.pagoForm = { importe: 0, medio: 'CASH', destino: '', fecha: this.nowLocal(), operacion: '', observacion: '' };
    this.pagoDialog = true;
  }
  get saldoActual(): number {
    return this.reserva()?.saldo ?? 0;
  }
  get abonadoResultante(): number {
    return (this.reserva()?.pagado ?? 0) + (this.pagoForm.importe || 0);
  }
  get saldoResultante(): number {
    const total = this.reserva()?.total ?? 0;
    return total - this.abonadoResultante;
  }
  get excedente(): number {
    return this.saldoResultante < 0 ? -this.saldoResultante : 0;
  }
  savePago(): void {
    const r = this.reserva();
    if (!r) return;
    if (this.pagoForm.importe <= 0) { this.messages.add({ severity: 'warn', summary: 'Importe inválido', detail: 'El pago debe ser mayor a 0.' }); return; }
    if (this.excedente > 0) { this.messages.add({ severity: 'warn', summary: 'Sobrepago', detail: `El pago excede el saldo en S/ ${this.excedente.toFixed(2)}. Ajusta el importe.` }); return; }
    if (r.origin === 'DEMO') {
      this.store.addPagoDemo(r.id, { id: Math.random().toString(36).slice(2, 10), importe: this.pagoForm.importe, medio: this.pagoForm.medio, destino: this.pagoForm.destino, fecha: new Date(this.pagoForm.fecha).toISOString(), operacion: this.pagoForm.operacion, observacion: this.pagoForm.observacion, tipo: 'RECIBIDO' });
      this.refresh();
      this.pagoDialog = false;
      this.messages.add({ severity: 'success', summary: 'Pago registrado', detail: 'Abono agregado a la reserva (demostración).' });
      return;
    }
    this.ops
      .reservationAddPayment(r.id, { importe: this.pagoForm.importe, medio: this.pagoForm.medio, destino: this.pagoForm.destino || undefined, operacion: this.pagoForm.operacion || undefined, observacion: this.pagoForm.observacion || undefined, fecha: new Date(this.pagoForm.fecha).toISOString() })
      .subscribe({
        next: () => { this.pagoDialog = false; this.messages.add({ severity: 'success', summary: 'Pago registrado', detail: 'Abono registrado en la reserva.' }); this.refresh(); },
        error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'No se registró', detail: e.error?.error?.message ?? 'No se pudo registrar el pago.' }),
      });
  }

  // ── Cancelación ──
  openCancel(): void {
    this.cancelMode = 'TOTAL';
    this.cancelHabs = [];
    this.cancelMotivo = '';
    this.cancelDialog = true;
  }
  toggleCancelHab(uid: string): void {
    this.cancelHabs = this.cancelHabs.includes(uid) ? this.cancelHabs.filter((x) => x !== uid) : [...this.cancelHabs, uid];
  }
  confirmCancel(): void {
    const r = this.reserva();
    if (!r) return;
    const habs = this.cancelMode === 'PARCIAL' ? this.cancelHabs : null;
    if (this.cancelMode === 'PARCIAL' && this.cancelHabs.length === 0) { this.messages.add({ severity: 'warn', summary: 'Selecciona habitaciones', detail: 'Marca al menos una habitación a cancelar.' }); return; }
    if (r.origin === 'DEMO') {
      this.store.cancelDemo(r.id, habs);
      this.refresh();
      this.cancelDialog = false;
      this.messages.add({ severity: 'info', summary: 'Reserva cancelada', detail: 'Registrada sin devolución automática (demostración).' });
      return;
    }
    if (this.cancelMode === 'PARCIAL') {
      this.messages.add({ severity: 'info', summary: 'Pendiente de conexión', detail: 'La cancelación parcial por habitación requiere backend (etapa posterior).' });
      return;
    }
    this.saving.set(true);
    this.ops.reservationStatus(r.id, { estado: 'CANCELADA', motivo: this.cancelMotivo || undefined }).subscribe({
      next: () => { this.saving.set(false); this.cancelDialog = false; this.messages.add({ severity: 'info', summary: 'Reserva cancelada', detail: 'Cancelada. No se registró devolución automática.' }); this.refresh(); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo cancelar.' }); },
    });
  }

  // ── Preparar check-in ──
  openPrep(): void {
    const r = this.reserva();
    if (!r) return;
    if (r.origin === 'DEMO') {
      this.messages.add({ severity: 'info', summary: 'Pendiente de conexión', detail: 'Preparar el ingreso usa el check-in real de recepción; no disponible para reservas de demostración.' });
      return;
    }
    this.ops.map().subscribe((res) => {
      const map = res.data ?? [];
      this.prepRooms.set(
        r.habitaciones.map((h) => ({ hab: h, selected: !!h.roomId, mapRoom: h.roomId ? map.find((m) => m.id === h.roomId) ?? null : null })),
      );
      this.prepDialog = true;
    });
  }
  continuarRecepcion(): void {
    const sel = this.prepRooms().find((x) => x.selected && x.mapRoom);
    if (!sel || !sel.mapRoom) {
      this.messages.add({ severity: 'warn', summary: 'Sin habitación asignada', detail: 'Asigna un número de habitación (en Modificar) antes de ingresar.' });
      return;
    }
    this.checkInRoom = sel.mapRoom;
    this.checkInGuestId = this.reserva()?.contacto.guestId ?? null;
    this.prepDialog = false;
    this.checkInVisible = true;
  }
  onCheckInDone(): void {
    this.messages.add({ severity: 'success', summary: 'Check-in realizado', detail: 'La habitación ingresó. El resto de la reserva se mantiene.' });
    this.reloadReal();
  }

  // ── Utilidades ──
  reloadReal(): void {
    this.store.setSource('REAL');
    this.refresh();
  }
  nowLocal(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  volver(): void {
    this.router.navigate(['/operations/reservas'], { queryParams: { vista: 'lista' } });
  }
  editar(): void {
    this.router.navigate(['/operations/reservas', this.id, 'editar']);
  }
}
