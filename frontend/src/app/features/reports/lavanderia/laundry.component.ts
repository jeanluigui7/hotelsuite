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
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { LaundryMachine } from '../../settings/catalogs/catalog.models';
import { ReportsApiService, type LaundryTask } from '../services/reports-api.service';

type St = 'PENDING' | 'WASHING' | 'DONE';
const META: Record<St, { label: string; severity: 'warn' | 'info' | 'success' }> = {
  PENDING: { label: 'Pendiente', severity: 'warn' },
  WASHING: { label: 'Lavando', severity: 'info' },
  DONE: { label: 'Listo', severity: 'success' },
};
const STATUS_OPTS = (Object.keys(META) as St[]).map((value) => ({ label: META[value].label, value }));

interface Form {
  id?: string;
  machineId: string | null;
  description: string;
  status: St;
}

@Component({
  selector: 'app-laundry',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Reporte Lavandería</h1>
          <p class="muted">Cargas de lavandería y su estado.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva carga" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="12" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Descripción</th><th>Máquina</th><th style="width:11rem">Creada</th><th style="width:9rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.description }}</td>
            <td>{{ row.machineName ?? '—' }}</td>
            <td class="muted">{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin cargas.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '460px' }" [header]="form.id ? 'Editar carga' : 'Nueva carga'">
      <div class="cat-form">
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" placeholder="Ej. Sábanas piso 2" />
        <label>Máquina (opcional)</label>
        <p-select [options]="machines()" optionLabel="name" optionValue="id" [(ngModel)]="form.machineId" [showClear]="true" placeholder="Sin asignar" styleClass="w-full" />
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
export class LaundryComponent implements OnInit {
  private readonly api = inject(ReportsApiService).laundryTasks;
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<LaundryTask[]>([]);
  readonly machines = signal<LaundryMachine[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOpts = STATUS_OPTS;

  dialogVisible = false;
  form: Form = { machineId: null, description: '', status: 'PENDING' };

  readonly canCreate = this.auth.can('reports', 'create');
  readonly canEdit = this.auth.can('reports', 'edit');
  readonly canDelete = this.auth.can('reports', 'delete');

  ngOnInit(): void {
    this.catalog.laundryMachines.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.machines.set(res.data ?? []));
    this.reload();
  }

  meta(s: St) {
    return META[s];
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100 }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { machineId: null, description: '', status: 'PENDING' };
    this.dialogVisible = true;
  }

  openEdit(row: LaundryTask): void {
    this.form = { id: row.id, machineId: row.machineId ?? null, description: row.description, status: row.status };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.description) {
      this.messages.add({ severity: 'warn', summary: 'Falta descripción', detail: 'Describe la carga.' });
      return;
    }
    const dto = { machineId: this.form.machineId, description: this.form.description, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Carga guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: LaundryTask): void {
    this.confirm.confirm({
      header: 'Eliminar carga',
      message: '¿Eliminar esta carga?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Carga eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
