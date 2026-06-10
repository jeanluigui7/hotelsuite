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
import type { Observation, Room } from '../services/operations.models';

interface Form {
  id?: string;
  roomId: string | null;
  title: string;
  body: string;
  status: 'OPEN' | 'RESOLVED';
}

@Component({
  selector: 'app-observations',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputTextarea, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Observaciones</h1>
          <p class="muted">Notas operativas, generales o por habitación.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva observación" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="toolbar">
        <p-select [options]="statusFilter" optionLabel="label" optionValue="value" [(ngModel)]="statusF" (onChange)="reload()" styleClass="status-sel" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width: 6rem">Hab.</th><th>Observación</th><th style="width: 11rem">Fecha</th><th style="width: 8rem">Estado</th><th style="width: 8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.room?.number ?? '—' }}</td>
            <td>@if (row.title) {<strong>{{ row.title }}</strong> · }{{ row.body }}</td>
            <td class="muted small">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="row.status === 'OPEN' ? 'Abierta' : 'Resuelta'" [severity]="row.status === 'OPEN' ? 'warn' : 'success'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin observaciones.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '500px' }" [header]="form.id ? 'Editar observación' : 'Nueva observación'">
      <div class="cat-form">
        <label>Habitación (opcional)</label>
        <p-select [options]="rooms()" optionValue="id" [(ngModel)]="form.roomId" [showClear]="true" placeholder="General" styleClass="w-full">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }}</ng-template>
        </p-select>
        <label>Título (opcional)</label>
        <input pInputText [(ngModel)]="form.title" />
        <label>Detalle</label>
        <textarea pInputTextarea [(ngModel)]="form.body" rows="3"></textarea>
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
      .small { font-size: 0.78rem; }
      .center { text-align: center; }
      .toolbar { margin-bottom: 1rem; }
      :host ::ng-deep .status-sel { width: 180px; }
      textarea { width: 100%; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class ObservationsComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Observation[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly statusOptions = [
    { label: 'Abierta', value: 'OPEN' },
    { label: 'Resuelta', value: 'RESOLVED' },
  ];
  readonly statusFilter = [{ label: 'Todas', value: '' }, ...this.statusOptions];

  statusF = '';
  dialogVisible = false;
  form: Form = { roomId: null, title: '', body: '', status: 'OPEN' };

  readonly canCreate = this.auth.can('operations', 'create');
  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canDelete = this.auth.can('operations', 'delete');

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 200, sortBy: 'number' }).subscribe((res) => this.rooms.set(res.data ?? []));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.ops.observations.list({ pageSize: 100, sortBy: 'createdAt', sortDir: 'desc', status: this.statusF || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { roomId: null, title: '', body: '', status: 'OPEN' };
    this.dialogVisible = true;
  }

  openEdit(row: Observation): void {
    this.form = { id: row.id, roomId: row.room?.id ?? null, title: row.title ?? '', body: row.body, status: row.status };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.body) {
      this.messages.add({ severity: 'warn', summary: 'Falta detalle', detail: 'Escribe el detalle.' });
      return;
    }
    const dto = { roomId: this.form.roomId, title: this.form.title || undefined, body: this.form.body, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.ops.observations.update(this.form.id, dto) : this.ops.observations.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Observación guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Observation): void {
    this.confirm.confirm({
      header: 'Eliminar observación',
      message: '¿Eliminar esta observación?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.observations.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Observación eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
