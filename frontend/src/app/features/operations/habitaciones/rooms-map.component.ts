import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { RoomType } from '../../settings/catalogs/catalog.models';
import { OperationsApiService } from '../services/operations-api.service';
import type { Room, RoomMapItem, RoomStatus } from '../services/operations.models';
import { CheckInDialogComponent } from './check-in-dialog.component';

const STATUS_LABEL: Record<RoomStatus, string> = {
  FREE: 'Libre',
  OCCUPIED: 'Ocupada',
  CLEANING: 'Limpieza',
  MAINTENANCE: 'Mantenimiento',
};

interface RoomForm {
  id?: string;
  roomTypeId: string;
  number: string;
  floor: string;
  notes: string;
}

@Component({
  selector: 'app-rooms-map',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TooltipModule,
    CheckInDialogComponent,
  ],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Habitaciones</h1>
          <p class="muted">
            Mapa en tiempo real · actualizado {{ lastUpdated() | date: 'HH:mm:ss' }}
          </p>
        </div>
        <div class="head-actions">
          <p-button icon="pi pi-refresh" severity="secondary" [text]="true" (onClick)="reload()" pTooltip="Refrescar" />
          @if (canCreate) {
            <p-button label="Nueva habitación" icon="pi pi-plus" (onClick)="openNewRoom()" />
          }
        </div>
      </header>

      <div class="legend">
        @for (s of statuses; track s) {
          <span class="legend-item"><span class="dot" [class]="'st-' + s"></span>{{ label(s) }}</span>
        }
      </div>

      @if (rooms().length === 0 && !loading()) {
        <p class="muted center pad">No hay habitaciones. Crea la primera con "Nueva habitación".</p>
      }

      <div class="grid">
        @for (room of rooms(); track room.id) {
          <div class="card" [class]="'st-' + room.status">
            <div class="card-top">
              <span class="num">{{ room.number }}</span>
              <p-tag [value]="label(room.status)" [styleClass]="'tag-' + room.status" />
            </div>
            <div class="card-body">
              <div class="type">{{ room.roomType.name }}</div>
              @if (room.floor) { <div class="muted small">Piso {{ room.floor }}</div> }
              @if (room.activeStay) {
                <div class="stay">
                  <i class="pi pi-user"></i> {{ room.activeStay.guestName }}
                  <div class="muted small">Salida: {{ room.activeStay.plannedCheckoutAt | date: 'dd/MM HH:mm' }}</div>
                </div>
              }
            </div>
            <div class="card-actions">
              @switch (room.status) {
                @case ('FREE') {
                  @if (canCreate) { <p-button label="Check-in" icon="pi pi-sign-in" size="small" (onClick)="openCheckIn(room)" /> }
                  @if (canEdit) { <p-button icon="pi pi-wrench" size="small" severity="secondary" [text]="true" (onClick)="setStatus(room, 'MAINTENANCE')" pTooltip="Mantenimiento" /> }
                }
                @case ('OCCUPIED') {
                  @if (canEdit) { <p-button label="Check-out" icon="pi pi-sign-out" size="small" severity="warn" (onClick)="confirmCheckOut(room)" /> }
                }
                @case ('CLEANING') {
                  @if (canEdit) { <p-button label="Marcar libre" icon="pi pi-check" size="small" severity="success" (onClick)="setStatus(room, 'FREE')" /> }
                }
                @case ('MAINTENANCE') {
                  @if (canEdit) { <p-button label="Marcar libre" icon="pi pi-check" size="small" severity="success" (onClick)="setStatus(room, 'FREE')" /> }
                }
              }
              @if (canEdit && room.status !== 'OCCUPIED') {
                <p-button icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEditRoom(room)" pTooltip="Editar" />
              }
            </div>
          </div>
        }
      </div>
    </section>

    <app-check-in-dialog [(visible)]="checkInVisible" [room]="selectedRoom" (done)="reload()" />

    <p-dialog [(visible)]="roomDialogVisible" [modal]="true" [style]="{ width: '440px' }"
              [header]="roomForm.id ? 'Editar habitación' : 'Nueva habitación'">
      <div class="form">
        <label>Número</label>
        <input pInputText [(ngModel)]="roomForm.number" />
        <label>Piso</label>
        <input pInputText [(ngModel)]="roomForm.floor" />
        <label>Tipo de habitación</label>
        <p-select [options]="roomTypes()" optionLabel="name" optionValue="id" [(ngModel)]="roomForm.roomTypeId"
                  placeholder="Seleccionar" styleClass="w-full" />
        <label>Notas</label>
        <input pInputText [(ngModel)]="roomForm.notes" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="roomDialogVisible = false" />
        @if (roomForm.id && canDelete) {
          <p-button label="Eliminar" severity="danger" [text]="true" (onClick)="confirmDeleteRoom()" />
        }
        <p-button label="Guardar" icon="pi pi-check" [loading]="savingRoom()" (onClick)="saveRoom()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .head { display: flex; align-items: flex-start; justify-content: space-between; }
      .head-actions { display: flex; gap: 0.5rem; }
      h1 { margin: 0; font-size: 1.4rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .small { font-size: 0.78rem; }
      .center { text-align: center; }
      .pad { padding: 2rem; }
      .legend { display: flex; gap: 1.25rem; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
      .legend-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
      .dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
      .card {
        border-radius: 12px; padding: 1rem;
        background: var(--p-content-background, #1f1f23);
        border: 1px solid var(--p-content-border-color, #2b2b30);
        border-left-width: 5px;
        display: flex; flex-direction: column; gap: 0.6rem; min-height: 150px;
      }
      .card-top { display: flex; align-items: center; justify-content: space-between; }
      .num { font-size: 1.4rem; font-weight: 700; }
      .card-body { flex: 1; }
      .type { font-size: 0.9rem; }
      .stay { margin-top: 0.5rem; font-size: 0.85rem; }
      .card-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
      .dot.st-FREE, .card.st-FREE { border-left-color: #f59e0b; }
      .dot.st-FREE { background: #f59e0b; }
      .dot.st-OCCUPIED, .card.st-OCCUPIED { border-left-color: #3b82f6; }
      .dot.st-OCCUPIED { background: #3b82f6; }
      .dot.st-CLEANING, .card.st-CLEANING { border-left-color: #14b8a6; }
      .dot.st-CLEANING { background: #14b8a6; }
      .dot.st-MAINTENANCE, .card.st-MAINTENANCE { border-left-color: #ef4444; }
      .dot.st-MAINTENANCE { background: #ef4444; }
      .form { display: flex; flex-direction: column; }
      .form label { margin: 0.7rem 0 0.3rem; font-size: 0.85rem; color: var(--p-text-muted-color, #a1a1aa); }
      .form input[pInputText] { width: 100%; }
      :host ::ng-deep .w-full { width: 100%; }
    `,
  ],
})
export class RoomsMapComponent implements OnInit, OnDestroy {
  private readonly ops = inject(OperationsApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly rooms = signal<RoomMapItem[]>([]);
  readonly roomTypes = signal<RoomType[]>([]);
  readonly loading = signal(false);
  readonly savingRoom = signal(false);
  readonly lastUpdated = signal<Date>(new Date());

  readonly statuses: RoomStatus[] = ['FREE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];

  checkInVisible = false;
  selectedRoom: RoomMapItem | null = null;

  roomDialogVisible = false;
  roomForm: RoomForm = { roomTypeId: '', number: '', floor: '', notes: '' };

  private pollId: ReturnType<typeof setInterval> | null = null;

  readonly canCreate = this.auth.can('operations', 'create');
  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canDelete = this.auth.can('operations', 'delete');

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.roomTypes.set(res.data ?? []));
    this.reload();
    this.pollId = setInterval(() => this.reload(true), 15_000);
  }

  ngOnDestroy(): void {
    if (this.pollId) clearInterval(this.pollId);
  }

  label(s: RoomStatus): string {
    return STATUS_LABEL[s];
  }

  reload(silent = false): void {
    if (!silent) this.loading.set(true);
    this.ops.map().subscribe({
      next: (res) => {
        this.rooms.set(res.data ?? []);
        this.lastUpdated.set(new Date());
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCheckIn(room: RoomMapItem): void {
    this.selectedRoom = room;
    this.checkInVisible = true;
  }

  confirmCheckOut(room: RoomMapItem): void {
    if (!room.activeStay) return;
    this.confirm.confirm({
      header: 'Check-out',
      message: `¿Cerrar la estancia de ${room.activeStay.guestName} (Hab. ${room.number})? La habitación pasará a Limpieza.`,
      icon: 'pi pi-sign-out',
      acceptLabel: 'Check-out',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.ops.checkOut(room.activeStay!.id, 'CLEANING').subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Check-out', detail: 'Estancia cerrada.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) =>
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo cerrar.' }),
        });
      },
    });
  }

  setStatus(room: RoomMapItem, status: RoomStatus): void {
    this.ops.changeRoomStatus(room.id, status).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) =>
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo cambiar el estado.' }),
    });
  }

  openNewRoom(): void {
    this.roomForm = { roomTypeId: this.roomTypes()[0]?.id ?? '', number: '', floor: '', notes: '' };
    this.roomDialogVisible = true;
  }

  openEditRoom(room: RoomMapItem): void {
    // Map items don't carry roomTypeId; resolve by name from the loaded types.
    const rtId = this.roomTypes().find((t) => t.id === room.roomType.id)?.id ?? room.roomType.id;
    this.roomForm = { id: room.id, roomTypeId: rtId, number: room.number, floor: room.floor ?? '', notes: room.notes ?? '' };
    this.roomDialogVisible = true;
  }

  saveRoom(): void {
    if (!this.roomForm.number || !this.roomForm.roomTypeId) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Número y tipo son obligatorios.' });
      return;
    }
    const dto = {
      roomTypeId: this.roomForm.roomTypeId,
      number: this.roomForm.number,
      floor: this.roomForm.floor || undefined,
      notes: this.roomForm.notes || undefined,
    };
    this.savingRoom.set(true);
    const req$ = this.roomForm.id
      ? this.ops.rooms.update(this.roomForm.id, dto as unknown as Partial<Room>)
      : this.ops.rooms.create(dto as unknown as Room);
    req$.subscribe({
      next: () => {
        this.savingRoom.set(false);
        this.roomDialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Habitación guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.savingRoom.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDeleteRoom(): void {
    if (!this.roomForm.id) return;
    this.confirm.confirm({
      header: 'Eliminar habitación',
      message: `¿Eliminar la habitación ${this.roomForm.number}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.rooms.remove(this.roomForm.id!).subscribe({
          next: () => {
            this.roomDialogVisible = false;
            this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Habitación eliminada.' });
            this.reload();
          },
          error: (err: HttpErrorResponse) =>
            this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
