import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { ClientTier, Guest, Rate } from '../../settings/catalogs/catalog.models';
import { DOCUMENT_TYPE_OPTIONS } from '../../settings/catalogs/catalog.constants';
import { OperationsApiService } from '../services/operations-api.service';
import type { CheckInInput, NewGuestInput, RoomMapItem } from '../services/operations.models';

@Component({
  selector: 'app-check-in-dialog',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    SelectModule,
    SelectButtonModule,
  ],
  template: `
    <p-dialog
      [visible]="visible"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [style]="{ width: '600px' }"
      [header]="'Check-in · Habitación ' + (room?.number ?? '')"
    >
      <div class="form">
        <!-- Huésped -->
        <h3>Huésped</h3>
        <p-selectButton [options]="guestModeOptions" optionLabel="label" optionValue="value"
                        [(ngModel)]="guestMode" [allowEmpty]="false" />

        @if (guestMode === 'existing') {
          <label>Buscar cliente</label>
          <div class="search-row">
            <input pInputText placeholder="Nombre o documento…" [(ngModel)]="guestSearch" (keyup.enter)="searchGuests()" />
            <p-button icon="pi pi-search" (onClick)="searchGuests()" />
          </div>
          <p-select [options]="guestResults()" [(ngModel)]="selectedGuestId" optionValue="id"
                    [filter]="false" placeholder="Seleccionar cliente" styleClass="w-full">
            <ng-template let-g pTemplate="item">{{ g.firstName }} {{ g.lastName }} · {{ g.documentNumber }}</ng-template>
            <ng-template let-g pTemplate="selectedItem">{{ g.firstName }} {{ g.lastName }} · {{ g.documentNumber }}</ng-template>
          </p-select>
        } @else {
          <div class="row">
            <div class="col">
              <label>Tipo doc.</label>
              <p-select [options]="docTypes" optionLabel="label" optionValue="value" [(ngModel)]="newGuest.documentType" styleClass="w-full" />
            </div>
            <div class="col">
              <label>Número</label>
              <input pInputText [(ngModel)]="newGuest.documentNumber" />
            </div>
          </div>
          <div class="row">
            <div class="col"><label>Nombres</label><input pInputText [(ngModel)]="newGuest.firstName" /></div>
            <div class="col"><label>Apellidos</label><input pInputText [(ngModel)]="newGuest.lastName" /></div>
          </div>
          <div class="row">
            <div class="col"><label>Teléfono</label><input pInputText [(ngModel)]="newGuest.phone" /></div>
            <div class="col"><label>Email</label><input pInputText type="email" [(ngModel)]="newGuest.email" /></div>
          </div>
        }

        <!-- Tarifa -->
        <h3>Tarifa y estancia</h3>
        <div class="row">
          <div class="col">
            <label>Tarifa</label>
            <p-select [options]="rates()" [(ngModel)]="selectedRateId" optionValue="id"
                      (onChange)="recalc()" placeholder="Seleccionar tarifa" styleClass="w-full">
              <ng-template let-r pTemplate="item">{{ r.label }} · {{ r.durationMinutes }} min · {{ r.price }}</ng-template>
              <ng-template let-r pTemplate="selectedItem">{{ r.label }} · {{ r.price }}</ng-template>
            </p-select>
          </div>
          <div class="col">
            <label>Tier (opcional)</label>
            <p-select [options]="tiers()" optionLabel="name" optionValue="id" [(ngModel)]="selectedTierId"
                      [showClear]="true" (onChange)="recalc()" placeholder="Sin tier" styleClass="w-full" />
          </div>
        </div>
        <div class="row">
          <div class="col"><label>Adultos</label><p-inputNumber [(ngModel)]="adults" [min]="1" styleClass="w-full" /></div>
          <div class="col"><label>Niños</label><p-inputNumber [(ngModel)]="children" [min]="0" styleClass="w-full" /></div>
        </div>

        <label>Placa de vehículo (opcional)</label>
        <input pInputText [(ngModel)]="vehiclePlate" placeholder="Ej. ABC-123" style="text-transform: uppercase;" />

        <label>Huéspedes adicionales (opcional)</label>
        <p-multiSelect [options]="guestResults()" optionValue="id" [(ngModel)]="additionalGuestIds"
                       placeholder="Buscar arriba y seleccionar" styleClass="w-full">
          <ng-template let-g pTemplate="item">{{ g.firstName }} {{ g.lastName }}</ng-template>
        </p-multiSelect>

        <label>Notas</label>
        <input pInputText [(ngModel)]="notes" />

        @if (pricePreview() !== null) {
          <div class="price">
            Precio acordado: <strong>{{ pricePreview() | number: '1.2-2' }}</strong>
            @if (selectedTierId) { <span class="muted">(tarifa con descuento de tier)</span> }
          </div>
        }
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="onVisibleChange(false)" />
        <p-button label="Confirmar check-in" icon="pi pi-check" [loading]="saving()" (onClick)="confirm()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .form { display: flex; flex-direction: column; }
      h3 { margin: 1rem 0 0.5rem; font-size: 1rem; }
      label { margin: 0.7rem 0 0.3rem; font-size: 0.85rem; color: var(--p-text-muted-color, #a1a1aa); }
      input[pInputText] { width: 100%; }
      .row { display: flex; gap: 1rem; }
      .row > .col { flex: 1; display: flex; flex-direction: column; }
      .search-row { display: flex; gap: 0.5rem; }
      .search-row input { flex: 1; }
      .price { margin-top: 1rem; padding: 0.7rem 0.9rem; border-radius: 8px; background: rgba(52,211,153,0.12); }
      .muted { color: var(--p-text-muted-color, #a1a1aa); font-size: 0.82rem; }
      :host ::ng-deep .w-full { width: 100%; }
    `,
  ],
})
export class CheckInDialogComponent {
  private readonly catalog = inject(CatalogApiService);
  private readonly ops = inject(OperationsApiService);
  private readonly messages = inject(MessageService);

  private _room: RoomMapItem | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  @Input() set room(value: RoomMapItem | null) {
    this._room = value;
    if (value) this.init(value);
  }
  get room(): RoomMapItem | null {
    return this._room;
  }

  /** Optional guest to preselect (used when converting a reservation to check-in). */
  @Input() prefillGuestId: string | null = null;

  readonly docTypes = DOCUMENT_TYPE_OPTIONS;
  readonly guestModeOptions = [
    { label: 'Cliente existente', value: 'existing' },
    { label: 'Nuevo cliente', value: 'new' },
  ];

  readonly rates = signal<Rate[]>([]);
  readonly tiers = signal<ClientTier[]>([]);
  readonly guestResults = signal<Guest[]>([]);
  readonly pricePreview = signal<number | null>(null);
  readonly saving = signal(false);

  guestMode: 'existing' | 'new' = 'existing';
  guestSearch = '';
  selectedGuestId: string | null = null;
  newGuest: NewGuestInput = { documentType: 'DNI', documentNumber: '', firstName: '', lastName: '', phone: '', email: '' };
  selectedRateId: string | null = null;
  selectedTierId: string | null = null;
  additionalGuestIds: string[] = [];
  adults = 1;
  children = 0;
  vehiclePlate = '';
  notes = '';

  private init(room: RoomMapItem): void {
    this.guestMode = 'existing';
    this.guestSearch = '';
    this.selectedGuestId = null;
    this.newGuest = { documentType: 'DNI', documentNumber: '', firstName: '', lastName: '', phone: '', email: '' };
    this.selectedRateId = null;
    this.selectedTierId = null;
    this.additionalGuestIds = [];
    this.adults = 1;
    this.children = 0;
    this.vehiclePlate = '';
    this.notes = '';
    this.pricePreview.set(null);

    this.catalog.rates.list({ roomTypeId: room.roomType.id }).subscribe((res) => this.rates.set(res.data ?? []));
    this.catalog.clientTiers.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.tiers.set(res.data ?? []));
    this.searchGuests();

    // Preselect a guest when converting a reservation.
    if (this.prefillGuestId) {
      this.guestMode = 'existing';
      const id = this.prefillGuestId;
      this.catalog.guests.get(id).subscribe((res) => {
        if (res.data) {
          this.guestResults.set([res.data, ...this.guestResults().filter((g) => g.id !== id)]);
          this.selectedGuestId = id;
        }
      });
    }
  }

  searchGuests(): void {
    this.catalog.guests.list({ pageSize: 20, search: this.guestSearch || undefined }).subscribe((res) =>
      this.guestResults.set(res.data ?? []),
    );
  }

  recalc(): void {
    const rate = this.rates().find((r) => r.id === this.selectedRateId);
    if (!rate) {
      this.pricePreview.set(null);
      return;
    }
    const tier = this.tiers().find((t) => t.id === this.selectedTierId);
    const discount = tier ? Number(tier.discountPercent) : 0;
    this.pricePreview.set(Math.round(Number(rate.price) * (1 - discount / 100) * 100) / 100);
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  confirm(): void {
    if (!this.room || !this.selectedRateId) {
      this.messages.add({ severity: 'warn', summary: 'Falta tarifa', detail: 'Selecciona una tarifa.' });
      return;
    }
    const input: CheckInInput = {
      roomId: this.room.id,
      rateId: this.selectedRateId,
      tierId: this.selectedTierId ?? null,
      additionalGuestIds: this.additionalGuestIds,
      adults: this.adults,
      children: this.children,
      vehiclePlate: this.vehiclePlate || undefined,
      notes: this.notes || undefined,
    };
    if (this.guestMode === 'existing') {
      if (!this.selectedGuestId) {
        this.messages.add({ severity: 'warn', summary: 'Falta huésped', detail: 'Selecciona un cliente.' });
        return;
      }
      input.guestId = this.selectedGuestId;
    } else {
      if (!this.newGuest.documentNumber || !this.newGuest.firstName) {
        this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa documento y nombres.' });
        return;
      }
      input.newGuest = this.newGuest;
    }

    this.saving.set(true);
    this.ops.checkIn(input).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Check-in', detail: 'Habitación ocupada.' });
        this.onVisibleChange(false);
        this.done.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo registrar el check-in.' });
      },
    });
  }
}
