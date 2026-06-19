import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { OperationsApiService } from '../services/operations-api.service';
import type { RoomMapItem } from '../services/operations.models';
import { CheckInDialogComponent } from '../habitaciones/check-in-dialog.component';
import { VentaProductosComponent } from './venta-productos.component';
import { roomState } from './room-states';

type ViewMode = 'normal' | 'compacta' | 'real';

@Component({
  selector: 'app-habitaciones-board',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, SelectModule, InputTextModule, TooltipModule, CheckInDialogComponent, VentaProductosComponent],
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
            <button class="act" (click)="soon('Vehículos')"><i class="pi pi-car"></i> Vehículos</button>
            <button class="act" (click)="checkInHint()"><i class="pi pi-sign-in"></i> Check-in</button>
            <button class="act" (click)="ventaVisible = true"><i class="pi pi-shopping-cart"></i> Venta Productos</button>
            <button class="act primary" (click)="soon('Servicios y Penalidades')"><i class="pi pi-tags"></i> Servicios y Penalidades</button>
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
              } @else {
                <div class="caption">{{ st(r).caption }}</div>
              }
            </div>

            <div class="foot">
              @if (r.status === 'FREE') {
                <button class="cta" (click)="openCheckIn(r)"><i class="pi pi-sign-in"></i> Check-in</button>
              } @else if (r.status === 'OCCUPIED') {
                <button class="cta ghost" (click)="confirmCheckout(r)"><i class="pi pi-sign-out"></i> Check-out</button>
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
      .muted { opacity: 0.8; }
      .foot { margin-top: auto; }
      .cta { width: 100%; background: rgba(255,255,255,0.92); color: #0b1018; border: 0; border-radius: 10px; padding: 0.6rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; justify-content: center; }
      .cta.ghost { background: rgba(0,0,0,0.28); color: #fff; }
      .cta:disabled { opacity: 0.6; cursor: default; }
      .empty { grid-column: 1/-1; text-align: center; padding: 2rem; }
    `,
  ],
})
export class HabitacionesBoardComponent implements OnInit, OnDestroy {
  private readonly ops = inject(OperationsApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly rooms = signal<RoomMapItem[]>([]);
  readonly view = signal<ViewMode>('normal');
  search = '';
  floorFilter: string | null = null;
  stateFilter: string | null = null;
  typeFilter: string | null = null;

  checkInVisible = false;
  ventaVisible = false;
  selectedRoom: RoomMapItem | null = null;
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

  confirmCheckout(r: RoomMapItem): void {
    if (!r.activeStay) return;
    this.confirm.confirm({
      header: 'Confirmar check-out',
      message: `¿Cerrar la estancia de la habitación ${r.number}? Pasará a limpieza en espera.`,
      acceptLabel: 'Check-out',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.ops.checkOut(r.activeStay!.id, 'CLEANING').subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Check-out', detail: `Habitación ${r.number}` });
            this.reload();
          },
          error: (err) => this.toast.add({ severity: 'error', summary: 'Error', detail: err?.error?.error?.message ?? 'No se pudo cerrar' }),
        });
      },
    });
  }

  soon(feature: string): void {
    this.toast.add({ severity: 'info', summary: feature, detail: 'Se construye en el siguiente paso de la Recepción (R2).' });
  }
}
