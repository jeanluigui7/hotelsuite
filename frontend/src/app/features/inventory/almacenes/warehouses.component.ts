import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
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

        @if (form.id && form.type === 'CLEANING') {
          <div class="subw">
            <label>Subalmacenes (pisos / torres)</label>
            <p class="subw-hint">Son las ubicaciones del inventario de ropa de este almacén (ej. Piso 1, Torre A). Aparecen en el Inventario Limpieza y en la Transferencia.</p>
            <div class="subw-chips">
              @for (s of subs(); track s.id) {
                <span class="subw-chip">{{ s.name }} <button type="button" (click)="removeSub(s)"><i class="pi pi-times"></i></button></span>
              } @empty { <span class="muted">Sin subalmacenes. Agrega el primero.</span> }
            </div>
            <div class="subw-add">
              <input pInputText [(ngModel)]="newSub" placeholder="Ej: Piso 1, Torre A" (keyup.enter)="addSub()" />
              <button type="button" class="subw-btn" (click)="addSub()"><i class="pi pi-plus"></i> Agregar</button>
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
      .subw { margin-top: 0.6rem; border-top: 1px solid #1c2c44; padding-top: 0.7rem; }
      .subw-hint { color: #8b97a8; font-size: 0.76rem; margin: 0.1rem 0 0.5rem; }
      .subw-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
      .subw-chip { display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(59,130,246,0.15); border: 1px solid #274468; color: #cfe0f5; border-radius: 8px; padding: 0.3rem 0.6rem; font-size: 0.82rem; }
      .subw-chip button { background: transparent; border: 0; color: #f87171; cursor: pointer; padding: 0; display: inline-flex; }
      .subw-add { display: flex; gap: 0.5rem; }
      .subw-add input { flex: 1; }
      .subw-btn { background: #131f30; border: 1px dashed #3a4d6b; color: #93c5fd; border-radius: 8px; padding: 0.4rem 0.8rem; cursor: pointer; white-space: nowrap; }
    `,
  ],
})
export class WarehousesComponent implements OnInit {
  private readonly api = inject(InventoryApiService).warehouses;
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Subalmacenes (pisos/torres) del almacén de ropa-limpieza, editables desde este modal.
  readonly subs = signal<{ id: string; name: string }[]>([]);
  private linenAreaId: string | null = null;
  newSub = '';

  /** Abre la asignación de habitaciones a subalmacenes (Cobertura). */
  goSubwarehouses(): void { void this.router.navigateByUrl('/inventory/cobertura'); }

  /** Carga los subalmacenes del almacén ROPA - LIMPIEZA (área de ropa). */
  private loadSubs(): void {
    this.subs.set([]); this.linenAreaId = null;
    this.http.get<ApiResponse<{ areaId: string; subWarehouses: { id: string; name: string }[] }>>(`${this.apiUrl}/subwarehouses/linen-area`).subscribe({
      next: (r) => { this.linenAreaId = r.data?.areaId ?? null; this.subs.set(r.data?.subWarehouses ?? []); },
      error: () => {},
    });
  }
  addSub(): void {
    const name = this.newSub.trim();
    if (!name || !this.linenAreaId) return;
    if (this.subs().some((s) => s.name.toLowerCase() === name.toLowerCase())) { this.messages.add({ severity: 'warn', summary: 'Repetido', detail: `"${name}" ya existe.` }); return; }
    this.http.post<ApiResponse<{ id: string; name: string }>>(`${this.apiUrl}/subwarehouses`, { areaId: this.linenAreaId, name }).subscribe({
      next: () => { this.newSub = ''; this.loadSubs(); this.messages.add({ severity: 'success', summary: 'Subalmacén creado', detail: name }); },
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo crear.' }),
    });
  }
  removeSub(s: { id: string; name: string }): void {
    this.confirm.confirm({
      header: 'Eliminar subalmacén', message: `¿Eliminar "${s.name}"? Se quitan sus asignaciones de habitaciones.`, icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.http.delete<ApiResponse<unknown>>(`${this.apiUrl}/subwarehouses/${s.id}`).subscribe({
        next: () => { this.loadSubs(); this.messages.add({ severity: 'success', summary: 'Eliminado', detail: '' }); },
        error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }),
      }),
    });
  }

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
    this.subs.set([]); this.newSub = '';
    this.dialogVisible = true;
  }

  openEdit(row: Warehouse): void {
    this.form = { id: row.id, name: row.name, type: row.type, status: row.status as 'active' | 'inactive' };
    this.subs.set([]); this.newSub = '';
    if (row.type === 'CLEANING') this.loadSubs();
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
