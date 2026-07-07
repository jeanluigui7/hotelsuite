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
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { InventoryCategory } from '../../settings/catalogs/catalog.models';
import { STATUS_OPTIONS } from '../../settings/catalogs/catalog.constants';

interface Form {
  id?: string;
  name: string;
  type: string | null;
  description: string;
  status: 'active' | 'inactive';
}
const CATEGORY_TYPES = [
  { label: 'Productos', value: 'PRODUCTS', icon: 'pi pi-box', cls: 'tp-prod' },
  { label: 'Ropa', value: 'CLOTHING', icon: 'pi pi-stop', cls: 'tp-ropa' },
  { label: 'Limpieza', value: 'CLEANING', icon: 'pi pi-trash', cls: 'tp-limp' },
  { label: 'Amenities', value: 'AMENITIES', icon: 'pi pi-sparkles', cls: 'tp-amen' },
];

@Component({
  selector: 'app-inventory-categories',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Categorías</h1>
          <p class="muted">Categorías de inventario para clasificar artículos.</p>
        </div>
        @if (canCreate) { <p-button label="Nueva categoría" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width: 10rem">Tipo</th><th>Categoría</th><th>Descripción</th><th style="width: 8rem">Estado</th><th style="width: 8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td><span class="tp" [class]="typeClass(row.type)"><i [class]="typeIcon(row.type)"></i> {{ typeLabel(row.type) }}</span></td>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.description }}</td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin categorías.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '420px' }" [header]="form.id ? 'Editar categoría' : 'Nueva categoría'">
      <div class="cat-form">
        <label>Tipo / Área</label>
        <p-select [options]="typeOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.type" [showClear]="true" placeholder="Sin clasificar" styleClass="w-full" />
        <label>Categoría (nombre)</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" />
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
  styles: [
    `
      .tp { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 700; padding: 0.22rem 0.7rem; border-radius: 999px; white-space: nowrap; }
      .tp-prod { background: rgba(139,92,246,0.2); color: #c4b5fd; }
      .tp-ropa { background: rgba(236,72,153,0.2); color: #f9a8d4; }
      .tp-limp { background: rgba(59,130,246,0.2); color: #93c5fd; }
      .tp-amen { background: rgba(16,185,129,0.2); color: #6ee7b7; }
      .tp-none { background: rgba(148,163,184,0.18); color: #cbd5e1; }
    `,
  ],
})
export class InventoryCategoriesComponent implements OnInit {
  private readonly api = inject(CatalogApiService).inventoryCategories;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<InventoryCategory[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;

  dialogVisible = false;
  form: Form = { name: '', type: null, description: '', status: 'active' };
  readonly typeOptions = CATEGORY_TYPES;

  typeLabel(v?: string | null): string { return CATEGORY_TYPES.find((t) => t.value === v)?.label ?? 'Sin clasificar'; }
  typeIcon(v?: string | null): string { return CATEGORY_TYPES.find((t) => t.value === v)?.icon ?? 'pi pi-tag'; }
  typeClass(v?: string | null): string { return CATEGORY_TYPES.find((t) => t.value === v)?.cls ?? 'tp-none'; }

  readonly canCreate = this.auth.can('inventory', 'create');
  readonly canEdit = this.auth.can('inventory', 'edit');
  readonly canDelete = this.auth.can('inventory', 'delete');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', type: null, description: '', status: 'active' };
    this.dialogVisible = true;
  }

  openEdit(row: InventoryCategory): void {
    this.form = { id: row.id, name: row.name, type: row.type ?? null, description: row.description ?? '', status: row.status as 'active' | 'inactive' };
    this.dialogVisible = true;
  }

  save(): void {
    const dto = { name: this.form.name, type: this.form.type, description: this.form.description, status: this.form.status };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Categoría guardada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: InventoryCategory): void {
    this.confirm.confirm({
      header: 'Eliminar categoría',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Categoría eliminada.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
