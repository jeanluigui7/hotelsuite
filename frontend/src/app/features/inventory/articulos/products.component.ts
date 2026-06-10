import { Component, OnInit, inject, signal } from '@angular/core';
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
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { InventoryCategory } from '../../settings/catalogs/catalog.models';
import { STATUS_OPTIONS } from '../../settings/catalogs/catalog.constants';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Product } from '../services/inventory.models';

interface Form {
  id?: string;
  name: string;
  sku: string;
  categoryId: string | null;
  salePrice: number | null;
  cost: number | null;
  status: 'active' | 'inactive';
  stock: number;
}

function emptyForm(): Form {
  return { name: '', sku: '', categoryId: null, salePrice: null, cost: null, status: 'active', stock: 0 };
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Artículos</h1>
          <p class="muted">Productos vendibles y su stock (almacén Productos).</p>
        </div>
        @if (canCreate) { <p-button label="Nuevo artículo" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="cat-toolbar">
        <input pInputText placeholder="Buscar…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Nombre</th><th>SKU</th><th>Categoría</th>
            <th style="width: 7rem">Precio</th><th style="width: 6rem">Stock</th>
            <th style="width: 8rem">Estado</th><th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.sku }}</td>
            <td>{{ row.category?.name ?? '—' }}</td>
            <td>{{ row.salePrice }}</td>
            <td><p-tag [value]="row.stock" [severity]="row.stock > 0 ? 'success' : 'danger'" /></td>
            <td><p-tag [value]="row.status === 'active' ? 'Activo' : 'Inactivo'" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
            <td class="cat-actions">
              @if (canEdit) { <p-button icon="pi pi-pencil" [text]="true" (onClick)="openEdit(row)" /> }
              @if (canDelete) { <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(row)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="muted center">Sin artículos.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '520px' }" [header]="form.id ? 'Editar artículo' : 'Nuevo artículo'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <div class="row">
          <div class="col"><label>SKU</label><input pInputText [(ngModel)]="form.sku" /></div>
          <div class="col">
            <label>Categoría</label>
            <p-select [options]="categories()" optionLabel="name" optionValue="id" [(ngModel)]="form.categoryId" [showClear]="true" placeholder="Sin categoría" styleClass="w-full" />
          </div>
        </div>
        <div class="row">
          <div class="col"><label>Precio venta</label><p-inputNumber [(ngModel)]="form.salePrice" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" /></div>
          <div class="col"><label>Costo</label><p-inputNumber [(ngModel)]="form.cost" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" /></div>
        </div>
        <div class="row">
          <div class="col"><label>Stock</label><p-inputNumber [(ngModel)]="form.stock" [min]="0" styleClass="w-full" /></div>
          <div class="col">
            <label>Estado</label>
            <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class ProductsComponent implements OnInit {
  private readonly api = inject(InventoryApiService).products;
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Product[]>([]);
  readonly categories = signal<InventoryCategory[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;

  search = '';
  dialogVisible = false;
  form: Form = emptyForm();

  readonly canCreate = this.auth.can('inventory', 'create');
  readonly canEdit = this.auth.can('inventory', 'edit');
  readonly canDelete = this.auth.can('inventory', 'delete');

  ngOnInit(): void {
    this.catalog.inventoryCategories.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.categories.set(res.data ?? []));
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
    this.form = emptyForm();
    this.dialogVisible = true;
  }

  openEdit(row: Product): void {
    this.form = {
      id: row.id,
      name: row.name,
      sku: row.sku ?? '',
      categoryId: row.categoryId ?? null,
      salePrice: Number(row.salePrice),
      cost: row.cost != null ? Number(row.cost) : null,
      status: row.status as 'active' | 'inactive',
      stock: row.stock,
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name || this.form.salePrice == null) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Nombre y precio son obligatorios.' });
      return;
    }
    const dto = {
      name: this.form.name,
      sku: this.form.sku || undefined,
      categoryId: this.form.categoryId ?? null,
      salePrice: this.form.salePrice,
      cost: this.form.cost ?? undefined,
      status: this.form.status,
      stock: this.form.stock,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Artículo guardado.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' });
      },
    });
  }

  confirmDelete(row: Product): void {
    this.confirm.confirm({
      header: 'Eliminar artículo',
      message: `¿Eliminar "${row.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Artículo eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
