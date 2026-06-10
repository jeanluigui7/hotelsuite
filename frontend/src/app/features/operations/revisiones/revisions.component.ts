import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationsApiService } from '../services/operations-api.service';
import type { Revision, Room } from '../services/operations.models';

type St = 'PENDING' | 'OK' | 'ISSUE';
const META: Record<St, { label: string; severity: 'warn' | 'success' | 'danger' }> = {
  PENDING: { label: 'Pendiente', severity: 'warn' },
  OK: { label: 'Conforme', severity: 'success' },
  ISSUE: { label: 'Con observación', severity: 'danger' },
};
const STATUS_OPTS = (Object.keys(META) as St[]).map((value) => ({ label: META[value].label, value }));

interface Form {
  id?: string;
  roomId: string | null;
  notes: string;
  status: St;
}

@Component({
  selector: 'app-revisions',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Revisiones</h1>
          <p class="muted">Revisiones de estado de habitaciones.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva revisión" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width:6rem">Hab.</th><th>Notas</th><th style="width:11rem">Fecha</th><th style="width:11rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.roomNumber }}</td>
            <td class="muted">{{ row.notes }}</td>
            <td class="muted">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin revisiones.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '460px' }" [header]="form.id ? 'Editar revisión' : 'Nueva revisión'">
      <div class="cat-form">
        <label>Habitación</label>
        <p-select [options]="rooms()" optionValue="id" [(ngModel)]="form.roomId" placeholder="Seleccionar" styleClass="w-full">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }}</ng-template>
        </p-select>
        <label>Notas</label>
        <input pInputText [(ngModel)]="form.notes" />
        <label>Estado</label>
        <p-select [options]="statusOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class RevisionsComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Revision[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOpts = STATUS_OPTS;

  dialogVisible = false;
  form: Form = { roomId: null, notes: '', status: 'PENDING' };

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
    this.ops.revisions.list({ pageSize: 100 }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { roomId: null, notes: '', status: 'PENDING' };
    this.dialogVisible = true;
  }

  openEdit(row: Revision): void {
    this.form = { id: row.id, roomId: row.roomId, notes: row.notes ?? '', status: row.status };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.roomId) {
      this.messages.add({ severity: 'warn', summary: 'Falta habitación', detail: 'Selecciona la habitación.' });
      return;
    }
    const dto = { roomId: this.form.roomId, notes: this.form.notes || undefined, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.ops.revisions.update(this.form.id, dto) : this.ops.revisions.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Revisión guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Revision): void {
    this.confirm.confirm({
      header: 'Eliminar revisión',
      message: `¿Eliminar la revisión de la Hab. ${row.roomNumber}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.ops.revisions.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Revisión eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
