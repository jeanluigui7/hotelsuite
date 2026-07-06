import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Warehouse, WarehouseType } from '../services/inventory.models';
import { STATUS_OPTIONS } from '../../settings/catalogs/catalog.constants';

const TYPES: { label: string; value: WarehouseType }[] = [
  { label: 'Productos', value: 'PRODUCTS' },
  { label: 'Ropa', value: 'CLOTHING' },
  { label: 'Recepción', value: 'RECEPTION' },
  { label: 'Limpieza', value: 'CLEANING' },
  { label: 'Lavandería', value: 'LAUNDRY' },
  { label: 'Amenities', value: 'AMENITIES' },
];

interface Form {
  id?: string;
  name: string;
  type: WarehouseType;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-warehouses',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Almacenes</h1>
          <p class="muted">Almacenes por sucursal (Productos, Ropa, Amenities…).</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo almacén" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>Tipo</th><th style="width:8rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td>{{ typeLabel(row.type) }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (row.type === 'CLEANING') { <p-button label="Subalmacenes" icon="pi pi-sitemap" [text]="true" (onClick)="goSubwarehouses()" title="Crear/editar subalmacenes (pisos/torres)" /> }
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted center">Sin almacenes.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" [header]="form.id ? 'Editar almacén' : 'Nuevo almacén'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Tipo</label>
        <p-select [options]="types" optionLabel="label" optionValue="value" [(ngModel)]="form.type" styleClass="w-full" />
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
export class WarehousesComponent implements OnInit {
  private readonly api = inject(InventoryApiService).warehouses;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly router = inject(Router);

  /** Abre la gestión de subalmacenes (pisos/torres) del almacén de ropa-limpieza. */
  goSubwarehouses(): void { void this.router.navigateByUrl('/inventory/cobertura'); }

  readonly items = signal<Warehouse[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly types = TYPES;
  readonly statusOptions = STATUS_OPTIONS;

  dialogVisible = false;
  form: Form = { name: '', type: 'PRODUCTS', status: 'active' };

  readonly canCreate = this.auth.can('inventory', 'create');
  readonly canEdit = this.auth.can('inventory', 'edit');
  readonly canDelete = this.auth.can('inventory', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  typeLabel(v: string): string {
    return TYPES.find((t) => t.value === v)?.label ?? v;
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', type: 'PRODUCTS', status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(row: Warehouse): void {
    this.form = { id: row.id, name: row.name, type: row.type, status: row.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name) {
      this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el nombre.' });
      return;
    }
    const dto = { name: this.form.name, type: this.form.type, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Almacén guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Warehouse): void {
    this.confirm.confirm({
      header: 'Eliminar almacén',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Almacén eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
