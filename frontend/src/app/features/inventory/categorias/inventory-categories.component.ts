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
  sizes: string[];
}
/** Tipos de ítem (definen qué módulo/lógica usan los artículos de la categoría). */
const ITEM_TYPES = [
  { label: 'Productos', value: 'PRODUCT' },
  { label: 'Ropa', value: 'CLOTHING' },
  { label: 'Amenities', value: 'AMENITY' },
  { label: 'Insumo de limpieza', value: 'CLEANING_SUPPLY' },
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
          <tr><th>Nombre</th><th style="width: 12rem">Tipo de ítem</th><th>Descripción</th><th style="width: 8rem">Estado</th><th style="width: 8rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td>{{ typeLabel(row.type) }}</td>
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

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '460px' }" [header]="form.id ? 'Editar categoría' : 'Nueva categoría'">
      <div class="cat-form">
        <label>Nombre</label>
        <input pInputText [(ngModel)]="form.name" />
        <label>Tipo de ítem *</label>
        <p-select [options]="itemTypes" optionLabel="label" optionValue="value" [(ngModel)]="form.type" placeholder="Selecciona" styleClass="w-full" />
        <label>Descripción</label>
        <input pInputText [(ngModel)]="form.description" />
        <label>Estado</label>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w-full" />

        @if (form.type === 'CLOTHING') {
          <div class="sizes">
            <label>Tamaños de esta categoría</label>
            <p class="hint">Estos tamaños estarán disponibles al crear ítems de ropa de esta categoría.</p>
            <div class="chips">
              @for (s of form.sizes; track s; let i = $index) {
                <span class="chip">{{ s }} <button type="button" (click)="removeSize(i)"><i class="pi pi-times"></i></button></span>
              }
            </div>
            <div class="addsize">
              <input pInputText [(ngModel)]="newSize" placeholder="Ej: Corporal, 2 plazas, King…" (keyup.enter)="addSize()" />
              <button type="button" class="add" (click)="addSize()"><i class="pi pi-plus"></i> Agregar tamaño</button>
            </div>
          </div>
        }
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
      .sizes { margin-top: 0.4rem; border-top: 1px solid #1c2c44; padding-top: 0.8rem; }
      .sizes .hint { color: #8b97a8; font-size: 0.78rem; margin: 0.1rem 0 0.6rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.6rem; }
      .chip { display: inline-flex; align-items: center; gap: 0.35rem; background: #131f30; border: 1px solid #26364f; color: #e6e9ef; border-radius: 8px; padding: 0.3rem 0.6rem; font-size: 0.82rem; }
      .chip button { background: transparent; border: 0; color: #f87171; cursor: pointer; padding: 0; display: inline-flex; }
      .addsize { display: flex; gap: 0.5rem; }
      .addsize input { flex: 1; }
      .addsize .add { background: #131f30; border: 1px dashed #3a4d6b; color: #93c5fd; border-radius: 8px; padding: 0.4rem 0.8rem; cursor: pointer; white-space: nowrap; }
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
  readonly itemTypes = ITEM_TYPES;

  dialogVisible = false;
  form: Form = { name: '', type: null, description: '', status: 'active', sizes: [] };
  newSize = '';

  typeLabel(v?: string | null): string { return ITEM_TYPES.find((t) => t.value === v)?.label ?? 'Sin clasificar'; }

  addSize(): void {
    const s = this.newSize.trim();
    if (!s) return;
    if (this.form.sizes.some((x) => x.toLowerCase() === s.toLowerCase())) { this.messages.add({ severity: 'warn', summary: 'Tamaño repetido', detail: `"${s}" ya está en la lista.` }); return; }
    this.form.sizes = [...this.form.sizes, s];
    this.newSize = '';
  }
  removeSize(i: number): void { this.form.sizes = this.form.sizes.filter((_, idx) => idx !== i); }

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
    this.form = { name: '', type: null, description: '', status: 'active', sizes: [] };
    this.newSize = '';
    this.dialogVisible = true;
  }

  openEdit(row: InventoryCategory): void {
    this.form = { id: row.id, name: row.name, type: row.type ?? null, description: row.description ?? '', status: row.status as 'active' | 'inactive', sizes: [...(row.sizes ?? [])] };
    this.newSize = '';
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name.trim()) { this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Ingresa el nombre.' }); return; }
    if (!this.form.type) { this.messages.add({ severity: 'warn', summary: 'Falta tipo de ítem', detail: 'Selecciona el tipo de ítem.' }); return; }
    const dto = {
      name: this.form.name,
      type: this.form.type,
      description: this.form.description,
      status: this.form.status,
      sizes: this.form.type === 'CLOTHING' ? this.form.sizes : [],
    };
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
