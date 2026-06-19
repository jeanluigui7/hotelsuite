import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { OperationsApiService } from '../services/operations-api.service';
import type { CheckoutSummary, RoomMapItem } from '../services/operations.models';
import { CheckInDialogComponent } from '../habitaciones/check-in-dialog.component';
import { VentaProductosComponent } from './venta-productos.component';
import { ServiciosPenalidadesComponent } from './servicios-penalidades.component';
import { roomState } from './room-states';

type ViewMode = 'normal' | 'compacta' | 'real';

@Component({
  selector: 'app-habitaciones-board',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, SelectModule, InputTextModule, TooltipModule, DialogModule, CheckInDialogComponent, VentaProductosComponent, ServiciosPenalidadesComponent],
  template: `
    <section class="board">
      <header class="top">
        <div class="title-row">
          <h1>Habitaciones</h1>
          <div class="views">
            <button [class.active]="view() === 'normal'" (click)="view.set('normal')"><i class="pi pi-th-large"></i> Normal</button>
            <button [class.active]="view() === 'compacta'" (click)="view.set('compacta')"><i class="pi pi-bars"></i> Compacta</button>
            <button [class.active]="view() === 'real'" (click)="view.set('real')"><i class="pi pi-image"></i> Real</button>
          </div>
          <div class="actions">
            <button class="act" (click)="vehiculosVisible = true"><i class="pi pi-car"></i> Vehículos</button>
            <button class="act" (click)="checkInHint()"><i class="pi pi-sign-in"></i> Check-in</button>
            <button class="act" (click)="ventaVisible = true"><i class="pi pi-shopping-cart"></i> Venta Productos</button>
            <button class="act primary" (click)="serviciosVisible = true"><i class="pi pi-tags"></i> Servicios y Penalidades</button>
          </div>
        </div>

        <div class="filters">
          <span class="f"><i class="pi pi-search"></i><input pInputText placeholder="Buscar por número…" [(ngModel)]="search" /></span>
          <p-select [options]="floorOptions()" [(ngModel)]="floorFilter" placeholder="Todos los pisos" [showClear]="true" styleClass="dk" />
          <p-select [options]="stateOptions" [(ngModel)]="stateFilter" optionLabel="label" optionValue="value" placeholder="Todos los estados" [showClear]="true" styleClass="dk" />
          <p-select [options]="typeOptions()" [(ngModel)]="typeFilter" placeholder="Todos los tipos" [showClear]="true" styleClass="dk" />
          <button class="refresh" (click)="reload()" pTooltip="Actualizar"><i class="pi pi-refresh"></i></button>
        </div>
      </header>

      <div class="grid" [class.compacta]="view() === 'compacta'" [class.real]="view() === 'real'">
        @for (r of filtered(); track r.id) {
          <article class="card" [style.background]="st(r).gradient">
            <div class="card-head">
              <span class="num"># {{ r.number }}</span>
              <span class="piso"><i class="pi pi-building"></i> {{ r.floor || '-' }}° piso</span>
            </div>
            <div class="type">{{ r.roomType.name }}</div>
            <div class="state"><i [class]="st(r).icon"></i> {{ st(r).label }}</div>

            <div class="body">
              @if (r.activeStay) {
                <div class="guest"><i class="pi pi-user"></i> {{ r.activeStay.guestName }}</div>
                <div class="cap muted">Salida: {{ r.activeStay.plannedCheckoutAt | date: 'dd/MM HH:mm' }}</div>
                <div class="cap muted">Precio: {{ +r.activeStay.priceAgreed | number: '1.2-2' }}</div>
                @if (r.activeStay.vehiclePlate) {
                  <div class="cap plate"><i class="pi pi-car"></i> {{ r.activeStay.vehiclePlate }}</div>
                }
                @if ((r.activeStay.pending || 0) > 0) {
                  <div class="debe"><i class="pi pi-exclamation-circle"></i> Debe {{ r.activeStay.pending || 0 | number: '1.2-2' }}</div>
                }
              } @else {
                <div class="caption">{{ st(r).caption }}</div>
              }
            </div>

            <div class="foot">
              @if (r.status === 'FREE') {
                <button class="cta" (click)="openCheckIn(r)"><i class="pi pi-sign-in"></i> Check-in</button>
              } @else if (r.status === 'OCCUPIED') {
                <div class="foot-row">
                  <button class="cta ghost" (click)="confirmCheckout(r)"><i class="pi pi-sign-out"></i> Check-out</button>
                  <button class="cta ghost sm" (click)="openChange(r)" pTooltip="Cambiar de habitación"><i class="pi pi-arrow-right-arrow-left"></i></button>
                </div>
              } @else {
                <button class="cta ghost" disabled>{{ st(r).label }}</button>
              }
            </div>
          </article>
        } @empty {
          <p class="muted empty">No hay habitaciones que coincidan con el filtro.</p>
        }
      </div>
    </section>

    <app-check-in-dialog [(visible)]="checkInVisible" [room]="selectedRoom" (done)="reload()" />
    <app-venta-productos [(visible)]="ventaVisible" (done)="reload()" />
    <app-servicios-penalidades [(visible)]="serviciosVisible" (done)="reload()" />

    <p-dialog [(visible)]="checkoutVisible" [modal]="true" [header]="'Check-out · Hab. ' + (checkoutRoom?.number || '')" [style]="{ width: '28rem' }" styleClass="dk-dialog">
      @if (checkoutData(); as d) {
        @if (d.totalWithLate > 0) {
          <div class="co-pend">
            <h3><i class="pi pi-exclamation-triangle"></i> Pagos Pendientes</h3>
            <p>La habitación tiene pagos pendientes por un total de <strong class="amt">S/ {{ d.totalWithLate | number: '1.2-2' }}</strong>.</p>
          </div>
        }
        <div class="co-guest">
          <span class="lbl">Detalles del huésped</span>
          <strong>{{ checkoutRoom?.activeStay?.guestName }}</strong>
          @if (checkoutRoom?.activeStay?.vehiclePlate) { <span class="muted">Placa: {{ checkoutRoom?.activeStay?.vehiclePlate }}</span> }
        </div>
        @if (d.lateCharge > 0) {
          <div class="co-late"><i class="pi pi-clock"></i> Late check-out: {{ d.lateHours }}h = {{ d.lateCharge | number: '1.2-2' }} (se agrega al adeudo)</div>
        }
        <div class="co-kv"><span>Recargos (early/late)</span><strong>{{ d.balanceDue + d.lateCharge | number: '1.2-2' }}</strong></div>
        <div class="co-kv"><span>Consumos sin pagar</span><strong>{{ d.salesPending | number: '1.2-2' }}</strong></div>
        <div class="co-kv total" [class.debt]="d.totalWithLate > 0"><span>Total pendiente</span><strong>{{ d.totalWithLate | number: '1.2-2' }}</strong></div>
        @if (d.totalWithLate > 0) {
          <div class="co-opts">
            <strong>Opciones:</strong>
            <p><b>Procesar Pago:</b> abre la caja para registrar el pago.</p>
            <p><b>Continuar Checkout:</b> el monto pendiente se registra como deuda del cliente.</p>
          </div>
        }
      } @else {
        <p class="muted">Calculando…</p>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="checkoutVisible = false" />
        @if ((checkoutData()?.totalWithLate || 0) > 0) {
          <p-button label="Procesar Pago" icon="pi pi-wallet" severity="secondary" (onClick)="goProcesarPago()" />
        }
        <p-button label="Continuar Checkout" icon="pi pi-sign-out" [loading]="checkingOut()" (onClick)="doCheckout()" />
      </ng-template>
    </p-dialog>

    <p-dialog [(visible)]="vehiculosVisible" [modal]="true" header="Vehículos en estancia" [style]="{ width: '32rem' }" styleClass="dk-dialog">
      @if (vehiculos().length) {
        <table class="veh">
          <thead><tr><th>Placa</th><th>Hab.</th><th>Huésped</th><th>Salida</th></tr></thead>
          <tbody>
            @for (v of vehiculos(); track v.plate + v.room) {
              <tr><td class="pl">{{ v.plate }}</td><td>{{ v.room }}</td><td>{{ v.guest }}</td><td class="muted">{{ v.out | date: 'dd/MM HH:mm' }}</td></tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="muted">No hay vehículos registrados en estancias activas.</p>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="vehiculosVisible = false" /></ng-template>
    </p-dialog>

    <p-dialog [(visible)]="changeVisible" [modal]="true" [header]="'Cambiar habitación · ' + (changeRoom?.number || '')" [style]="{ width: '26rem' }" styleClass="dk-dialog">
      <div class="ch-form">
        <label>Habitación de destino</label>
        <p-select [options]="freeRooms()" [(ngModel)]="destRoomId" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona habitación disponible" styleClass="w">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType.name }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType.name }}</ng-template>
        </p-select>
        <label>¿Cómo debe quedar la habitación {{ changeRoom?.number }} (origen)?</label>
        <div class="ch-opts">
          <label class="radio"><input type="radio" name="os" value="CLEANING" [(ngModel)]="originStatus" /> Sucia para limpieza</label>
          <label class="radio"><input type="radio" name="os" value="FREE" [(ngModel)]="originStatus" /> Disponible</label>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="changeVisible = false" />
        <p-button label="Confirmar Cambio" icon="pi pi-arrow-right-arrow-left" [disabled]="!destRoomId" [loading]="changing()" (onClick)="doChange()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host { display: block; }
      .board { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; font-size: 1.7rem; color: #fff; }
      .top { margin-bottom: 1.25rem; }
      .title-row { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; justify-content: space-between; }
      .views { display: inline-flex; background: #131b27; border: 1px solid #1f2a3a; border-radius: 10px; padding: 3px; gap: 2px; }
      .views button { background: transparent; border: 0; color: #9fb0c3; padding: 0.45rem 0.85rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .views button.active { background: #0f9b6c; color: #fff; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .act { background: #131b27; border: 1px solid #243245; color: #cdd8e6; border-radius: 10px; padding: 0.55rem 0.95rem; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.45rem; }
      .act:hover { border-color: #10b981; }
      .act.primary { background: #7c2d4d; border-color: #b03a68; color: #ffd9e7; }
      .filters { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 1rem; }
      .f { position: relative; display: inline-flex; align-items: center; }
      .f i { position: absolute; left: 0.7rem; color: #6b7a90; }
      .f input { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 0.7rem 0.55rem 2rem; width: 240px; }
      :host ::ng-deep .dk .p-select { background: #131b27; border-color: #243245; }
      :host ::ng-deep .dk .p-select-label { color: #cdd8e6; }
      .refresh { background: #131b27; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.55rem 0.7rem; cursor: pointer; }

      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.1rem; }
      .grid.compacta { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
      .grid.real { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
      .card { border-radius: 16px; padding: 1.1rem; color: #fff; display: flex; flex-direction: column; gap: 0.5rem; min-height: 200px; box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      .grid.compacta .card { min-height: 150px; padding: 0.85rem; gap: 0.35rem; }
      .grid.real .card { min-height: 260px; }
      .card-head { display: flex; align-items: center; justify-content: space-between; }
      .num { font-size: 1.25rem; font-weight: 800; }
      .piso { font-size: 0.78rem; background: rgba(0,0,0,0.25); padding: 0.2rem 0.6rem; border-radius: 999px; }
      .type { font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; opacity: 0.95; text-transform: uppercase; }
      .state { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; background: rgba(0,0,0,0.22); width: fit-content; padding: 0.25rem 0.7rem; border-radius: 999px; }
      .body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 0.2rem; text-align: center; }
      .grid.compacta .body { display: none; }
      .caption { opacity: 0.85; font-size: 0.9rem; }
      .guest { font-weight: 700; }
      .cap { font-size: 0.8rem; }
      .debe { margin-top: 0.3rem; background: rgba(0,0,0,0.3); color: #fde68a; border: 1px solid rgba(251,191,36,0.5); padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }
      .muted { opacity: 0.8; }
      .foot { margin-top: auto; }
      .cta { width: 100%; background: rgba(255,255,255,0.92); color: #0b1018; border: 0; border-radius: 10px; padding: 0.6rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; justify-content: center; }
      .cta.ghost { background: rgba(0,0,0,0.28); color: #fff; }
      .cta:disabled { opacity: 0.6; cursor: default; }
      .foot-row { display: flex; gap: 0.4rem; }
      .foot-row .cta { flex: 1; }
      .cta.sm { flex: 0 0 auto; width: auto; padding: 0.6rem 0.7rem; }
      .ch-form { display: flex; flex-direction: column; gap: 0.4rem; }
      .ch-form label { font-size: 0.82rem; color: #9fb0c3; margin-top: 0.3rem; }
      :host ::ng-deep .ch-form .w .p-select { width: 100%; }
      .ch-opts { display: flex; flex-direction: column; gap: 0.4rem; }
      .ch-opts .radio { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
      .empty { grid-column: 1/-1; text-align: center; padding: 2rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      .co-pend { background: #2a1410; border: 1px solid #7f1d1d; border-radius: 10px; padding: 0.8rem 0.9rem; margin-bottom: 0.8rem; }
      .co-pend h3 { margin: 0 0 0.3rem; color: #fca5a5; font-size: 1rem; display: flex; align-items: center; gap: 0.4rem; }
      .co-pend p { margin: 0; font-size: 0.85rem; color: #e6e9ef; } .co-pend .amt { color: #f87171; }
      .co-guest { display: flex; flex-direction: column; gap: 0.15rem; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.7rem; }
      .co-guest .lbl { font-size: 0.72rem; color: #8b97a8; text-transform: uppercase; letter-spacing: 0.04em; }
      .co-opts { background: #2a1d12; border: 1px solid #6b4f2a; border-radius: 8px; padding: 0.6rem 0.8rem; margin-top: 0.7rem; font-size: 0.78rem; color: #fcd9a8; }
      .co-opts p { margin: 0.2rem 0 0; } .co-opts b { color: #fbbf24; }
      .co-late { background: #2a1d12; border: 1px solid #6b4f2a; color: #fbbf24; padding: 0.5rem 0.7rem; border-radius: 8px; font-size: 0.82rem; margin-bottom: 0.6rem; }
      .co-kv { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.95rem; }
      .co-kv.total { border-top: 1px solid #243245; margin-top: 0.4rem; padding-top: 0.55rem; }
      .co-kv.total.debt strong { color: #fbbf24; }
      .co-warn { color: #fbbf24; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; }
      .plate { background: rgba(0,0,0,0.28); border-radius: 999px; padding: 0.15rem 0.6rem; width: fit-content; margin: 0.15rem auto 0; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }
      .veh { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
      .veh th, .veh td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #1f2a3a; }
      .veh th { color: #9fb0c3; font-weight: 600; }
      .veh .pl { font-weight: 700; color: #34d399; }
    `,
  ],
})
export class HabitacionesBoardComponent implements OnInit, OnDestroy {
  private readonly ops = inject(OperationsApiService);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);

  readonly rooms = signal<RoomMapItem[]>([]);
  readonly view = signal<ViewMode>('normal');
  search = '';
  floorFilter: string | null = null;
  stateFilter: string | null = null;
  typeFilter: string | null = null;

  checkInVisible = false;
  ventaVisible = false;
  serviciosVisible = false;
  checkoutVisible = false;
  vehiculosVisible = false;
  readonly checkingOut = signal(false);
  checkoutRoom: RoomMapItem | null = null;
  readonly checkoutData = signal<CheckoutSummary | null>(null);
  selectedRoom: RoomMapItem | null = null;
  changeVisible = false;
  changeRoom: RoomMapItem | null = null;
  destRoomId: string | null = null;
  originStatus: 'CLEANING' | 'FREE' = 'CLEANING';
  readonly changing = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  readonly stateOptions = [
    { label: 'Disponible', value: 'FREE' },
    { label: 'Ocupada', value: 'OCCUPIED' },
    { label: 'Limpieza en espera', value: 'CLEANING' },
    { label: 'Mantenimiento', value: 'MAINTENANCE' },
  ];

  readonly floorOptions = computed(() =>
    [...new Set(this.rooms().map((r) => r.floor).filter((f): f is string => !!f))].sort(),
  );
  readonly typeOptions = computed(() => [...new Set(this.rooms().map((r) => r.roomType.name))].sort());
  readonly freeRooms = computed(() => this.rooms().filter((r) => r.status === 'FREE'));

  readonly vehiculos = computed(() =>
    this.rooms()
      .filter((r) => r.activeStay?.vehiclePlate)
      .map((r) => ({
        plate: r.activeStay!.vehiclePlate as string,
        room: r.number,
        guest: r.activeStay!.guestName,
        out: r.activeStay!.plannedCheckoutAt,
      })),
  );

  readonly filtered = computed<RoomMapItem[]>(() => {
    let list = this.rooms();
    if (this.search) list = list.filter((r) => r.number.toLowerCase().includes(this.search.toLowerCase()));
    if (this.floorFilter) list = list.filter((r) => r.floor === this.floorFilter);
    if (this.stateFilter) list = list.filter((r) => r.status === this.stateFilter);
    if (this.typeFilter) list = list.filter((r) => r.roomType.name === this.typeFilter);
    return list;
  });

  ngOnInit(): void {
    this.reload();
    this.timer = setInterval(() => this.reload(), 15_000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  st(r: RoomMapItem) {
    return roomState(r.status);
  }

  reload(): void {
    this.ops.map().subscribe((res) => this.rooms.set(res.data ?? []));
  }

  openCheckIn(r: RoomMapItem): void {
    this.selectedRoom = r;
    this.checkInVisible = true;
  }

  checkInHint(): void {
    this.toast.add({ severity: 'info', summary: 'Check-in', detail: 'Pulsa "Check-in" en una habitación disponible (verde).' });
  }

  goProcesarPago(): void {
    this.checkoutVisible = false;
    void this.router.navigateByUrl('/operations/caja');
  }

  openChange(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.changeRoom = r;
    this.destRoomId = null;
    this.originStatus = 'CLEANING';
    this.changeVisible = true;
  }

  doChange(): void {
    const r = this.changeRoom;
    if (!r?.activeStay || !this.destRoomId) return;
    this.changing.set(true);
    this.ops.changeRoom(r.activeStay.id, this.destRoomId, this.originStatus).subscribe({
      next: () => {
        this.changing.set(false);
        this.changeVisible = false;
        this.toast.add({ severity: 'success', summary: 'Cambio realizado', detail: `Hab. ${r.number} → cambio de habitación` });
        this.reload();
      },
      error: (err) => {
        this.changing.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cambiar' });
      },
    });
  }

  confirmCheckout(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.checkoutRoom = r;
    this.checkoutData.set(null);
    this.checkoutVisible = true;
    this.ops.checkoutSummary(r.activeStay.id).subscribe((res) => this.checkoutData.set(res.data));
  }

  doCheckout(): void {
    const r = this.checkoutRoom;
    if (!r?.activeStay) return;
    this.checkingOut.set(true);
    this.ops.checkOut(r.activeStay.id, 'CLEANING').subscribe({
      next: () => {
        this.checkingOut.set(false);
        this.checkoutVisible = false;
        this.toast.add({ severity: 'success', summary: 'Check-out', detail: `Habitación ${r.number} → Limpieza en espera` });
        this.reload();
      },
      error: (err) => {
        this.checkingOut.set(false);
        this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cerrar' });
      },
    });
  }
}
