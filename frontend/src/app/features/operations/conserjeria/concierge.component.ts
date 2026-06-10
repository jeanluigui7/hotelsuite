import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextarea } from 'primeng/inputtextarea';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { ConciergeRequest, Room } from '../services/operations.models';

type CStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

const STATUS_META: Record<CStatus, { label: string; severity: 'warn' | 'info' | 'success' | 'danger' }> = {
  PENDING: { label: 'Pendiente', severity: 'warn' },
  IN_PROGRESS: { label: 'En progreso', severity: 'info' },
  DONE: { label: 'Atendida', severity: 'success' },
  CANCELLED: { label: 'Cancelada', severity: 'danger' },
};
const STATUS_OPTIONS = (Object.keys(STATUS_META) as CStatus[]).map((value) => ({ label: STATUS_META[value].label, value }));

interface Form {
  id?: string;
  roomId: string | null;
  guestName: string;
  category: string;
  description: string;
  status: CStatus;
}

@Component({
  selector: 'app-concierge',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputTextarea, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Conserjería</h1>
          <p class="muted">Solicitudes de huéspedes (taxi, comida, despertador…).</p>
        </div>
        @if (canCreate) { <p-button label="Nueva solicitud" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="toolbar">
        <p-select [options]="statusFilter" optionLabel="label" optionValue="value" [(ngModel)]="statusF" (onChange)="reload()" styleClass="status-sel" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width: 6rem">Hab.</th><th>Huésped</th><th>Categoría</th><th>Solicitud</th><th style="width: 9rem">Estado</th><th style="width: 8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.room?.number ?? '—' }}</td>
            <td>{{ row.guestName ?? '—' }}</td>
            <td>{{ row.category ?? '—' }}</td>
            <td>{{ row.description }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin solicitudes.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '500px' }" [header]="form.id ? 'Editar solicitud' : 'Nueva solicitud'">
      <div class="cat-form">
        <div class="row">
          <div class="col">
            <label>Habitación (opcional)</label>
            <p-select [options]="rooms()" optionValue="id" [(ngModel)]="form.roomId" [showClear]="true" placeholder="Sin asignar" styleClass="w-full">
              <ng-template let-r pTemplate="item">Hab. {{ r.number }}</ng-template>
              <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }}</ng-template>
            </p-select>
          </div>
          <div class="col"><label>Categoría</label><input pInputText [(ngModel)]="form.category" placeholder="taxi, comida…" /></div>
        </div>
        <label>Huésped (opcional)</label>
        <input pInputText [(ngModel)]="form.guestName" />
        <label>Solicitud</label>
        <textarea pInputTextarea [(ngModel)]="form.description" rows="3"></textarea>
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      .toolbar { margin-bottom: 1rem; }
      :host ::ng-deep .status-sel { width: 180px; }
      textarea { width: 100%; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class ConciergeComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<ConciergeRequest[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly statusOptions = STATUS_OPTIONS;
  readonly statusFilter = [{ label: 'Todas', value: '' }, ...STATUS_OPTIONS];

  statusF = '';
  dialogVisible = false;
  form: Form = { roomId: null, guestName: '', category: '', description: '', status: 'PENDING' };

  readonly canCreate = this.auth.can('operations', 'create');
  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canDelete = this.auth.can('operations', 'delete');

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 200, sortBy: 'number' }).subscribe((res) => this.rooms.set(res.data ?? []));
    this.reload();
  }

  meta(s: CStatus) {
    return STATUS_META[s];
  }

  reload(): void {
    this.loading.set(true);
    this.ops.concierge.list({ pageSize: 100, sortBy: 'createdAt', sortDir: 'desc', status: this.statusF || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { roomId: null, guestName: '', category: '', description: '', status: 'PENDING' };
    this.dialogVisible = true;
  }

  openEdit(row: ConciergeRequest): void {
    this.form = {
      id: row.id,
      roomId: row.room?.id ?? null,
      guestName: row.guestName ?? '',
      category: row.category ?? '',
      description: row.description,
      status: row.status,
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.description) {
      this.messages.add({ severity: 'warn', summary: 'Falta solicitud', detail: 'Describe la solicitud.' });
      return;
    }
    const dto = {
      roomId: this.form.roomId,
      guestName: this.form.guestName || undefined,
      category: this.form.category || undefined,
      description: this.form.description,
      status: this.form.status,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.ops.concierge.update(this.form.id, dto) : this.ops.concierge.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Solicitud guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: ConciergeRequest): void {
    this.confirm.confirm({
      header: 'Eliminar solicitud',
      message: '¿Eliminar esta solicitud?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.concierge.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Solicitud eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
