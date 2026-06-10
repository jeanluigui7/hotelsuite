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
import { LogisticsApiService } from '../services/logistics-api.service';
import type { Supplier } from '../services/logistics.models';
import { STATUS_OPTIONS } from '../../settings/catalogs/catalog.constants';

interface Form {
  id?: string;
  name: string;
  taxId: string;
  contact: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
}

const EMPTY: Form = { name: '', taxId: '', contact: '', phone: '', email: '', status: 'active' };

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Proveedores</h1>
          <p class="muted">Directorio de proveedores de la sucursal.</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo proveedor" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="cat-toolbar">
        <input pInputText placeholder="Buscar…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>RUC</th><th>Contacto</th><th style="width:8rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.taxId }}</td>
            <td class="muted">{{ row.contact }}{{ row.phone ? ' · ' + row.phone : '' }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin proveedores.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '520px' }" [header]="form.id ? 'Editar proveedor' : 'Nuevo proveedor'">
      <div class="cat-form">
        <div class="row">
          <div class="col"><label>Nombre</label><input pInputText [(ngModel)]="form.name" /></div>
          <div class="col"><label>RUC</label><input pInputText [(ngModel)]="form.taxId" /></div>
        </div>
        <label>Contacto</label>
        <input pInputText [(ngModel)]="form.contact" />
        <div class="row">
          <div class="col"><label>Teléfono</label><input pInputText [(ngModel)]="form.phone" /></div>
          <div class="col"><label>Email</label><input pInputText type="email" [(ngModel)]="form.email" /></div>
        </div>
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class SuppliersComponent implements OnInit {
  private readonly api = inject(LogisticsApiService).suppliers;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Supplier[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;

  search = '';
  dialogVisible = false;
  form: Form = { ...EMPTY };

  readonly canCreate = this.auth.can('logistics', 'create');
  readonly canEdit = this.auth.can('logistics', 'edit');
  readonly canDelete = this.auth.can('logistics', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name', search: this.search || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { ...EMPTY };
    this.dialogVisible = true;
  }

  openEdit(row: Supplier): void {
    this.form = {
      id: row.id,
      name: row.name,
      taxId: row.taxId ?? '',
      contact: row.contact ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      status: row.status as 'active' | 'inactive',
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) {
      this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el nombre.' });
      return;
    }
    const { id, ...dto } = this.form;
    this.saving.set(true);
    const req$ = id ? this.api.update(id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Proveedor guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Supplier): void {
    this.confirm.confirm({
      header: 'Eliminar proveedor',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Proveedor eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
