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
import { OperationsApiService } from '../services/operations-api.service';
import type { Maintenance, Room } from '../services/operations.models';

type St = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
const META: Record<St, { label: string; severity: 'warn' | 'info' | 'success' | 'danger' }> = {
  OPEN: { label: 'Abierto', severity: 'warn' },
  IN_PROGRESS: { label: 'En progreso', severity: 'info' },
  DONE: { label: 'Resuelto', severity: 'success' },
  CANCELLED: { label: 'Cancelado', severity: 'danger' },
};
const STATUS_OPTS = (Object.keys(META) as St[]).map((value) => ({ label: META[value].label, value }));

interface Form {
  id?: string;
  roomId: string | null;
  title: string;
  description: string;
  status: St;
  cost: number | null;
}

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Mantenimientos</h1>
          <p class="muted">Órdenes de mantenimiento, generales o por habitación.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo mantenimiento" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Título</th><th style="width:6rem">Hab.</th><th style="width:7rem">Costo</th><th style="width:11rem">Creado</th><th style="width:9rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.title }}<div class="muted small">{{ row.description }}</div></td>
            <td>{{ row.roomNumber ?? '—' }}</td>
            <td>{{ row.cost ?? '—' }}</td>
            <td class="muted">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin mantenimientos.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '520px' }" [header]="form.id ? 'Editar mantenimiento' : 'Nuevo mantenimiento'">
      <div class="cat-form">
        <label>Título</label>
        <input pInputText [(ngModel)]="form.title" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" />
        <div class="row">
          <div class="col">
            <label>Habitación (opcional)</label>
            <p-select [options]="rooms()" optionValue="id" [(ngModel)]="form.roomId" [showClear]="true" placeholder="General" styleClass="w-full">
              <ng-template let-r pTemplate="item">Hab. {{ r.number }}</ng-template>
              <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }}</ng-template>
            </p-select>
          </div>
          <div class="col"><label>Costo</label><p-inputNumber [(ngModel)]="form.cost" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" /></div>
        </div>
        <label>Estado</label>
        <p-select [options]="statusOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`.small { font-size: 0.78rem; }`],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class MaintenanceComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Maintenance[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOpts = STATUS_OPTS;

  dialogVisible = false;
  form: Form = { roomId: null, title: '', description: '', status: 'OPEN', cost: null };

  readonly canCreate = this.auth.can('operations', 'create');
  readonly canEdit = this.auth.can('operations', 'edit');
  readonly canDelete = this.auth.can('operations', 'delete');

  ngOnInit(): void {
    this.ops.rooms.list({ pageSize: 200, sortBy: 'number' }).subscribe((res) => this.rooms.set(res.data ?? []));
    this.reload();
  }

  meta(s: St) {
    return META[s];
  }

  reload(): void {
    this.loading.set(true);
    this.ops.maintenances.list({ pageSize: 100 }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { roomId: null, title: '', description: '', status: 'OPEN', cost: null };
    this.dialogVisible = true;
  }

  openEdit(row: Maintenance): void {
    this.form = {
      id: row.id,
      roomId: row.roomId ?? null,
      title: row.title,
      description: row.description ?? '',
      status: row.status,
      cost: row.cost != null ? Number(row.cost) : null,
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.title) {
      this.messages.add({ severity: 'warn', summary: 'Falta título', detail: 'Ingresa el título.' });
      return;
    }
    const dto = {
      roomId: this.form.roomId,
      title: this.form.title,
      description: this.form.description || undefined,
      status: this.form.status,
      cost: this.form.cost ?? undefined,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.ops.maintenances.update(this.form.id, dto) : this.ops.maintenances.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Mantenimiento guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Maintenance): void {
    this.confirm.confirm({
      header: 'Eliminar mantenimiento',
      message: `¿Eliminar "${row.title}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.maintenances.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Mantenimiento eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
