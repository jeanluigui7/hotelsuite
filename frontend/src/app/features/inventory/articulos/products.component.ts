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
import type { Product, Warehouse } from '../services/inventory.models';

interface Form {
  id?: string;
  name: string; sku: string; barcode: string; imageUrl: string; brand: string;
  reusable: boolean; categoryId: string | null; productType: string;
  initialWarehouseId: string | null; unit: string; igvType: string; igvPercent: number;
  taxable: boolean; active: boolean;
  salePrice: number | null; cost: number | null;
  reorderPoint: number; receptionReorderPoint: number; stock: number;
}
function emptyForm(): Form {
  return { name: '', sku: '', barcode: '', imageUrl: '', brand: '', reusable: false, categoryId: null, productType: 'PRODUCTO', initialWarehouseId: null, unit: 'NIU', igvType: 'GRAVADO', igvPercent: 18, taxable: true, active: true, salePrice: null, cost: 0, reorderPoint: 0, receptionReorderPoint: 0, stock: 0 };
}
const PRODUCT_TYPES = [
  { label: 'Producto', value: 'PRODUCTO' }, { label: 'Servicio', value: 'SERVICIO' },
  { label: 'Amenity', value: 'AMENITY' }, { label: 'Insumo', value: 'INSUMO' },
];
const UNITS = [
  { label: 'NIU - Unidad (bienes)', value: 'NIU' }, { label: 'ZZ - Servicios', value: 'ZZ' },
  { label: 'KGM - Kilogramo', value: 'KGM' }, { label: 'LTR - Litro', value: 'LTR' }, { label: 'BX - Caja', value: 'BX' },
];
const IGV_TYPES = [
  { label: 'Gravado - Operación Onerosa', value: 'GRAVADO' }, { label: 'Exonerado', value: 'EXONERADO' }, { label: 'Inafecto', value: 'INAFECTO' },
];

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="cat-head">
        <div><h1>Artículos</h1><p class="muted">Productos vendibles y su stock (almacén Productos).</p></div>
        @if (canCreate) { <p-button label="Nuevo artículo" icon="pi pi-plus" (onClick)="openNew()" /> }
      </header>

      <div class="cat-toolbar">
        <input pInputText placeholder="Buscar…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Nombre</th><th>SKU</th><th>Categoría</th><th style="width:7rem">Precio</th><th style="width:6rem">Stock</th><th style="width:8rem">Estado</th><th style="width:8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td><td class="muted">{{ row.sku }}</td><td>{{ row.category?.name ?? '—' }}</td>
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

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '46rem', maxWidth: '96vw' }" [header]="form.id ? 'Editar Artículo' : 'Nuevo Artículo'">
      <p class="pf-sub">Modifica la información del artículo. Los campos marcados con <b>*</b> son obligatorios.</p>
      <div class="pf">
        <div class="f"><label>Código *</label><input pInputText [(ngModel)]="form.sku" placeholder="Ej: AMN-005" /></div>

        <div class="f"><label>Código de Barras</label>
          <div class="bc"><input pInputText [(ngModel)]="form.barcode" placeholder="EAN-13, EAN-8, UPC, etc." /><button class="bc-cam" type="button" pTooltip="Escanear" title="Escanear"><i class="pi pi-camera"></i></button></div>
          <small>Código de barras para escaneo rápido (opcional)</small>
        </div>

        <div class="f"><label>Imagen</label>
          <div class="img-row">
            <div class="img-thumb">@if (form.imageUrl) { <img [src]="form.imageUrl" alt="img" /> } @else { <i class="pi pi-image"></i> }</div>
            <label class="img-btn">Seleccionar archivo<input type="file" accept="image/*" (change)="onImage($event)" hidden /></label>
            <span class="img-name">{{ form.imageUrl ? 'Imagen cargada' : 'Ningún archivo seleccionado' }}</span>
          </div>
        </div>

        <div class="grid2">
          <div class="f"><label>Nombre *</label><input pInputText [(ngModel)]="form.name" /></div>
          <div class="f"><label>Marca</label><input pInputText [(ngModel)]="form.brand" placeholder="Marca del producto" /></div>
        </div>

        <label class="chk"><input type="checkbox" [(ngModel)]="form.reusable" /> <span>¿Es reutilizable?</span></label>

        <div class="grid2">
          <div class="f"><label>Categoría *</label><p-select [options]="categories()" optionLabel="name" optionValue="id" [(ngModel)]="form.categoryId" [showClear]="true" placeholder="Selecciona" styleClass="w-full" appendTo="body" /></div>
          <div class="f"><label>Tipo de Producto</label><p-select [options]="productTypes" optionLabel="label" optionValue="value" [(ngModel)]="form.productType" styleClass="w-full" appendTo="body" /></div>
        </div>

        <div class="f"><label>Área Inicial</label>
          <p-select [options]="warehouses()" optionLabel="name" optionValue="id" [(ngModel)]="form.initialWarehouseId" [showClear]="true" placeholder="Almacén por defecto" styleClass="w-full" appendTo="body" />
          <small>Selecciona el almacén donde se colocará este artículo inicialmente</small>
        </div>

        <div class="grid2">
          <div class="f"><label>Unidad</label><p-select [options]="units" optionLabel="label" optionValue="value" [(ngModel)]="form.unit" styleClass="w-full" appendTo="body" /></div>
          <div class="f"><label>Tipo de IGV</label><p-select [options]="igvTypes" optionLabel="label" optionValue="value" [(ngModel)]="form.igvType" styleClass="w-full" appendTo="body" /></div>
        </div>

        <div class="f"><label>Porcentaje IGV (%)</label><p-inputNumber [(ngModel)]="form.igvPercent" [min]="0" [max]="100" [minFractionDigits]="2" styleClass="w-full" /><small>Por defecto: 18%</small></div>

        <label class="chk"><input type="checkbox" [(ngModel)]="form.taxable" /> <span>¿Es tributable? (Sí)</span></label>
        <label class="chk"><input type="checkbox" [(ngModel)]="form.active" /> <span>¿Está activo? (Sí - visible en reportes)</span></label>

        <div class="grid2">
          <div class="f"><label>Precio de venta *</label><p-inputNumber [(ngModel)]="form.salePrice" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w-full" /></div>
          <div class="f"><label>Precio de compra *</label><p-inputNumber [(ngModel)]="form.cost" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w-full" /></div>
        </div>

        <div class="grid2">
          <div class="f"><label>Stock Mínimo (Almacén)</label><p-inputNumber [(ngModel)]="form.reorderPoint" [min]="0" styleClass="w-full" /><small>Alerta cuando el stock del almacén baje de este valor</small></div>
          <div class="f"><label>Stock Mínimo (Recepción) <span class="badge">Inventario de Ventas</span></label><p-inputNumber [(ngModel)]="form.receptionReorderPoint" [min]="0" styleClass="w-full" /></div>
        </div>

        @if (!form.id) { <div class="f"><label>Stock inicial (en el área seleccionada)</label><p-inputNumber [(ngModel)]="form.stock" [min]="0" styleClass="w-full" /></div> }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button [label]="form.id ? 'Actualizar' : 'Guardar'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .pf-sub { color: var(--p-text-muted-color, #8aa0bd); margin: 0 0 1rem; font-size: 0.85rem; }
      .pf { display: flex; flex-direction: column; gap: 0.9rem; }
      .pf .f { display: flex; flex-direction: column; gap: 0.3rem; }
      .pf label { font-size: 0.85rem; font-weight: 600; }
      .pf small { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.76rem; }
      .pf .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .pf input[pInputText], :host ::ng-deep .pf .w-full { width: 100%; }
      .pf .chk { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
      .bc { display: flex; gap: 0.4rem; } .bc input { flex: 1; }
      .bc-cam { background: var(--p-content-hover-background, #1b2433); border: 1px solid var(--p-content-border-color, #2b3a4f); color: inherit; border-radius: 8px; padding: 0 0.8rem; cursor: pointer; }
      .img-row { display: flex; align-items: center; gap: 0.7rem; }
      .img-thumb { width: 56px; height: 56px; border-radius: 10px; background: var(--p-content-hover-background, #1b2433); display: grid; place-items: center; overflow: hidden; flex: 0 0 auto; }
      .img-thumb img { width: 100%; height: 100%; object-fit: cover; } .img-thumb i { font-size: 1.3rem; color: #8aa0bd; }
      .img-btn { background: var(--p-content-hover-background, #1b2433); border: 1px solid var(--p-content-border-color, #2b3a4f); border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
      .img-name { color: var(--p-text-muted-color, #8aa0bd); font-size: 0.82rem; }
      .badge { background: rgba(37,99,235,0.2); color: #60a5fa; font-size: 0.66rem; font-weight: 700; padding: 0.1rem 0.45rem; border-radius: 6px; margin-left: 0.3rem; }
    `,
  ],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class ProductsComponent implements OnInit {
  private readonly inv = inject(InventoryApiService);
  private readonly api = this.inv.products;
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Product[]>([]);
  readonly categories = signal<InventoryCategory[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = STATUS_OPTIONS;
  readonly productTypes = PRODUCT_TYPES;
  readonly units = UNITS;
  readonly igvTypes = IGV_TYPES;

  search = '';
  dialogVisible = false;
  form: Form = emptyForm();

  readonly canCreate = this.auth.can('inventory', 'create');
  readonly canEdit = this.auth.can('inventory', 'edit');
  readonly canDelete = this.auth.can('inventory', 'delete');

  ngOnInit(): void {
    this.catalog.inventoryCategories.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.categories.set(res.data ?? []));
    this.inv.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => this.warehouses.set(res.data ?? []));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, sortBy: 'name', search: this.search || undefined }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onImage(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.messages.add({ severity: 'warn', summary: 'Archivo inválido', detail: 'Selecciona una imagen.' }); return; }
    if (file.size > 8_000_000) { this.messages.add({ severity: 'warn', summary: 'Imagen muy grande', detail: 'Máximo 8 MB.' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 512, scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        this.form.imageUrl = c.toDataURL('image/jpeg', 0.7);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  openNew(): void { this.form = emptyForm(); this.dialogVisible = true; }

  openEdit(row: Product): void {
    this.form = {
      id: row.id,
      name: row.name, sku: row.sku ?? '', barcode: row.barcode ?? '', imageUrl: row.imageUrl ?? '', brand: row.brand ?? '',
      reusable: !!row.reusable, categoryId: row.categoryId ?? null, productType: row.productType ?? 'PRODUCTO',
      initialWarehouseId: null, unit: row.unit ?? 'NIU', igvType: row.igvType ?? 'GRAVADO', igvPercent: row.igvPercent != null ? Number(row.igvPercent) : 18,
      taxable: row.taxable ?? true, active: row.status === 'active',
      salePrice: Number(row.salePrice), cost: row.cost != null ? Number(row.cost) : 0,
      reorderPoint: row.reorderPoint, receptionReorderPoint: row.receptionReorderPoint ?? 0, stock: row.stock,
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name || this.form.salePrice == null) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Nombre y precio de venta son obligatorios.' });
      return;
    }
    if (!this.form.categoryId) { this.messages.add({ severity: 'warn', summary: 'Falta categoría', detail: 'Selecciona una categoría.' }); return; }
    const dto = {
      name: this.form.name, sku: this.form.sku || undefined, barcode: this.form.barcode || undefined,
      imageUrl: this.form.imageUrl || undefined, brand: this.form.brand || undefined, reusable: this.form.reusable,
      categoryId: this.form.categoryId, productType: this.form.productType, unit: this.form.unit,
      igvType: this.form.igvType, igvPercent: this.form.igvPercent, taxable: this.form.taxable,
      salePrice: this.form.salePrice, cost: this.form.cost ?? 0,
      reorderPoint: this.form.reorderPoint, receptionReorderPoint: this.form.receptionReorderPoint,
      status: (this.form.active ? 'active' : 'inactive') as 'active' | 'inactive',
      stock: this.form.stock,
      initialWarehouseId: this.form.initialWarehouseId ?? undefined,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Artículo guardado.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  confirmDelete(row: Product): void {
    this.confirm.confirm({
      header: 'Eliminar artículo', message: `¿Eliminar "${row.name}"?`, icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.remove(row.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Artículo eliminado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
        });
      },
    });
  }
}
