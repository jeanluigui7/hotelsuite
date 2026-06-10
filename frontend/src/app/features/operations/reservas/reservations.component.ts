import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { Guest, RoomType } from '../../settings/catalogs/catalog.models';
import { DURATION_PRESETS } from '../../settings/catalogs/catalog.constants';
import { OperationsApiService } from '../services/operations-api.service';
import type { Reservation, ReservationStatus, RoomMapItem } from '../services/operations.models';
import { CheckInDialogComponent } from '../habitaciones/check-in-dialog.component';

const STATUS_META: Record<ReservationStatus, { label: string; severity: 'warn' | 'success' | 'danger' | 'secondary' }> = {
  PENDING: { label: 'Pendiente', severity: 'warn' },
  CONFIRMED: { label: 'Confirmada', severity: 'success' },
  CANCELLED: { label: 'Cancelada', severity: 'danger' },
  FULFILLED: { label: 'Cumplida', severity: 'secondary' },
};

const STATUS_OPTIONS = (Object.keys(STATUS_META) as ReservationStatus[]).map((value) => ({
  label: STATUS_META[value].label,
  value,
}));

interface Form {
  id?: string;
  roomTypeId: string;
  guestId: string | null;
  guestName: string;
  phone: string;
  expectedCheckInAt: string;
  durationMinutes: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  notes: string;
}

function emptyForm(): Form {
  return {
    roomTypeId: '',
    guestId: null,
    guestName: '',
    phone: '',
    expectedCheckInAt: '',
    durationMinutes: 1440,
    adults: 1,
    children: 0,
    status: 'PENDING',
    notes: '',
  };
}

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TableModule,
    TagModule,
    CheckInDialogComponent,
  ],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Reservas</h1>
          <p class="muted">Reservas por tipo de habitación. Convierte una confirmada en check-in.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva reserva" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="toolbar">
        <input pInputText placeholder="Buscar huésped…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-select [options]="statusFilter" optionLabel="label" optionValue="value" [(ngModel)]="statusF" (onChange)="reload()" styleClass="status-sel" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Huésped</th>
            <th>Tipo</th>
            <th>Hab.</th>
            <th>Entrada prevista</th>
            <th style="width: 6rem">Pax</th>
            <th style="width: 9rem">Estado</th>
            <th style="width: 12rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.guestName }}<div class="muted small">{{ row.phone }}</div></td>
            <td>{{ row.roomType.name }}</td>
            <td>{{ row.room?.number ?? '—' }}</td>
            <td>{{ row.expectedCheckInAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td>{{ row.adults }}+{{ row.children }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (canEdit && row.status === 'CONFIRMED') {
                <p-button label="Check-in" icon="pi pi-sign-in" size="small" (onClick)="startConvert(row)" />
              }
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="muted center">Sin reservas.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Crear/editar reserva -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '560px' }" [header]="form.id ? 'Editar reserva' : 'Nueva reserva'">
      <div class="cat-form">
        <label>Cliente registrado (opcional)</label>
        <div class="search-row">
          <input pInputText placeholder="Buscar cliente…" [(ngModel)]="guestSearch" (keyup.enter)="searchGuests()" />
          <p-button icon="pi pi-search" (onClick)="searchGuests()" />
        </div>
        <p-select [options]="guestResults()" [(ngModel)]="form.guestId" optionValue="id" [showClear]="true"
                  placeholder="Sin vincular" styleClass="w-full" (onChange)="onGuestPick()">
          <ng-template let-g pTemplate="item">{{ g.firstName }} {{ g.lastName }} · {{ g.documentNumber }}</ng-template>
          <ng-template let-g pTemplate="selectedItem">{{ g.firstName }} {{ g.lastName }}</ng-template>
        </p-select>

        <label>Nombre del huésped</label>
        <input pInputText [(ngModel)]="form.guestName" />
        <div class="row">
          <div class="col"><label>Teléfono</label><input pInputText [(ngModel)]="form.phone" /></div>
          <div class="col">
            <label>Tipo de habitación</label>
            <p-select [options]="roomTypes()" optionLabel="name" optionValue="id" [(ngModel)]="form.roomTypeId" placeholder="Seleccionar" styleClass="w-full" />
          </div>
        </div>
        <div class="row">
          <div class="col"><label>Entrada prevista</label><input pInputText type="datetime-local" [(ngModel)]="form.expectedCheckInAt" /></div>
          <div class="col">
            <label>Duración</label>
            <p-select [options]="durationPresets" optionLabel="label" optionValue="value" [(ngModel)]="form.durationMinutes" styleClass="w-full" />
          </div>
        </div>
        <div class="row">
          <div class="col"><label>Adultos</label><p-inputNumber [(ngModel)]="form.adults" [min]="1" styleClass="w-full" /></div>
          <div class="col"><label>Niños</label><p-inputNumber [(ngModel)]="form.children" [min]="0" styleClass="w-full" /></div>
        </div>
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
        <label>Notas</label>
        <input pInputText [(ngModel)]="form.notes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- Elegir habitación para convertir -->
    <p-dialog [(visible)]="convertVisible" [modal]="true" [style]="{ width: '420px' }" header="Asignar habitación">
      <div class="cat-form">
        <p class="muted">Habitaciones libres del tipo solicitado:</p>
        <p-select [options]="freeRooms()" optionValue="id" [(ngModel)]="convertRoomId" placeholder="Seleccionar habitación" styleClass="w-full">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }} {{ r.floor ? '· Piso ' + r.floor : '' }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }}</ng-template>
        </p-select>
        @if (freeRooms().length === 0) { <p class="muted">No hay habitaciones libres de ese tipo.</p> }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="convertVisible = false" />
        <p-button label="Continuar a check-in" icon="pi pi-arrow-right" [disabled]="!convertRoomId" (onClick)="proceedConvert()" />
      </ng-template>
    </p-dialog>

    <app-check-in-dialog [(visible)]="checkInVisible" [room]="checkInRoom" [prefillGuestId]="checkInGuestId" (done)="onCheckInDone()" />
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .small { font-size: 0.78rem; }
      .center { text-align: center; }
      .toolbar { display: flex; gap: 0.6rem; margin-bottom: 1rem; }
      .toolbar input { width: 280px; max-width: 100%; }
      :host ::ng-deep .status-sel { width: 160px; }
      .search-row { display: flex; gap: 0.5rem; }
      .search-row input { flex: 1; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class ReservationsComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Reservation[]>([]);
  readonly roomTypes = signal<RoomType[]>([]);
  readonly guestResults = signal<Guest[]>([]);
  readonly freeRooms = signal<RoomMapItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly statusOptions = STATUS_OPTIONS;
  readonly statusFilter = [{ label: 'Todas', value: '' }, ...STATUS_OPTIONS];
  readonly durationPresets = DURATION_PRESETS;

  search = '';
  statusF = '';
  guestSearch = '';

  dialogVisible = false;
  form: Form = emptyForm();

  convertVisible = false;
  convertRoomId: string | null = null;
  private convertReservation: Reservation | null = null;

  checkInVisible = false;
  checkInRoom: RoomMapItem | null = null;
  checkInGuestId: string | null = null;
  private pendingReservationId: string | null = null;

  readonly canCreate = this.auth.can('operations', 'create');
  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canDelete = this.auth.can('operations', 'delete');

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.roomTypes.set(res.data ?? []));
    this.searchGuests();
    this.reload();
  }

  meta(s: ReservationStatus) {
    return STATUS_META[s];
  }

  reload(): void {
    this.loading.set(true);
    this.ops.reservations.list({ pageSize: 100, sortBy: 'expectedCheckInAt', sortDir: 'desc', search: this.search || undefined, status: this.statusF || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  searchGuests(): void {
    this.catalog.guests.list({ pageSize: 20, search: this.guestSearch || undefined }).subscribe((res) => this.guestResults.set(res.data ?? []));
  }

  onGuestPick(): void {
    const g = this.guestResults().find((x) => x.id === this.form.guestId);
    if (g) this.form.guestName = `${g.firstName} ${g.lastName ?? ''}`.trim();
  }

  openNew(): void {
    this.form = emptyForm();
    this.dialogVisible = true;
  }

  openEdit(row: Reservation): void {
    this.form = {
      id: row.id,
      roomTypeId: row.roomType.id,
      guestId: row.guestId ?? null,
      guestName: row.guestName ?? '',
      phone: row.phone ?? '',
      expectedCheckInAt: row.expectedCheckInAt ? row.expectedCheckInAt.substring(0, 16) : '',
      durationMinutes: row.durationMinutes,
      adults: row.adults,
      children: row.children,
      status: row.status,
      notes: row.notes ?? '',
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.roomTypeId || !this.form.expectedCheckInAt || (!this.form.guestId && !this.form.guestName)) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Tipo, fecha y huésped son obligatorios.' });
      return;
    }
    const dto = {
      roomTypeId: this.form.roomTypeId,
      guestId: this.form.guestId ?? null,
      guestName: this.form.guestName || undefined,
      phone: this.form.phone || undefined,
      expectedCheckInAt: this.form.expectedCheckInAt,
      durationMinutes: this.form.durationMinutes,
      adults: this.form.adults,
      children: this.form.children,
      status: this.form.status,
      notes: this.form.notes || undefined,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.ops.reservations.update(this.form.id, dto) : this.ops.reservations.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Reserva guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  startConvert(row: Reservation): void {
    this.convertReservation = row;
    this.convertRoomId = null;
    this.ops.map().subscribe((res) => {
      const free = (res.data ?? []).filter((r) => r.status === 'FREE' && r.roomType.id === row.roomType.id);
      this.freeRooms.set(free);
      this.convertVisible = true;
    });
  }

  proceedConvert(): void {
    const room = this.freeRooms().find((r) => r.id === this.convertRoomId);
    if (!room || !this.convertReservation) return;
    this.checkInRoom = room;
    this.checkInGuestId = this.convertReservation.guestId ?? null;
    this.pendingReservationId = this.convertReservation.id;
    this.convertVisible = false;
    this.checkInVisible = true;
  }

  onCheckInDone(): void {
    if (this.pendingReservationId) {
      this.ops.reservations.update(this.pendingReservationId, { status: 'FULFILLED' }).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Reserva cumplida', detail: 'Check-in realizado.' });
          this.pendingReservationId = null;
          this.reload();
        },
        error: () => this.reload(),
      });
    } else {
      this.reload();
    }
  }

  confirmDelete(row: Reservation): void {
    this.confirm.confirm({
      header: 'Eliminar reserva',
      message: `¿Eliminar la reserva de ${row.guestName}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.reservations.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Reserva eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
