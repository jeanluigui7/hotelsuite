import { Component, OnInit, inject, signal } from '@angular/core';
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
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { LaundryMachine } from '../catalogs/catalog.models';

type St = 'available' | 'busy' | 'maintenance';
const META: Record<St, { label: string; severity: 'success' | 'warn' | 'danger' }> = {
  available: { label: 'Disponible', severity: 'success' },
  busy: { label: 'Ocupada', severity: 'warn' },
  maintenance: { label: 'Mantenimiento', severity: 'danger' },
};
const STATUS_OPTS = (Object.keys(META) as St[]).map((value) => ({ label: META[value].label, value }));

interface Form {
  id?: string;
  name: string;
  capacity: string;
  status: St;
}

@Component({
  selector: 'app-laundry-machines',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Máquinas de Lavandería</h1>
          <p class="muted">Lavadoras/secadoras de la sucursal.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva máquina" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>Capacidad</th><th style="width:11rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.capacity }}</td>
            <td><p-tag [value]="meta(row.status).label" [severity]="meta(row.status).severity" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted center">Sin máquinas.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" [header]="form.id ? 'Editar máquina' : 'Nueva máquina'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Capacidad</label>
        <input pInputText [(ngModel)]="form.capacity" placeholder="Ej. 10 kg" />
        <label>Estado</label>
        <p-select [options]="statusOpts" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../catalogs/catalog.styles.scss'],
})
export class LaundryMachinesComponent implements OnInit {
  private readonly api = inject(CatalogApiService).laundryMachines;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<LaundryMachine[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOpts = STATUS_OPTS;

  dialogVisible = false;
  form: Form = { name: '', capacity: '', status: 'available' };

  readonly canCreate = this.auth.can('settings', 'create');
  readonly canEdit = this.auth.can('settings', 'edit');
  readonly canDelete = this.auth.can('settings', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  meta(s: St) {
    return META[s];
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', capacity: '', status: 'available' };
    this.dialogVisible = true;
  }

  openEdit(row: LaundryMachine): void {
    this.form = { id: row.id, name: row.name, capacity: row.capacity ?? '', status: row.status };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) {
      this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el nombre.' });
      return;
    }
    const dto = { name: this.form.name, capacity: this.form.capacity, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Máquina guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: LaundryMachine): void {
    this.confirm.confirm({
      header: 'Eliminar máquina',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Máquina eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
