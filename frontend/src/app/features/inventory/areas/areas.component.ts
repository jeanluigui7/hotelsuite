import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../../settings/catalogs/catalog-api.service';
import type { Area } from '../../settings/catalogs/catalog.models';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Warehouse } from '../services/inventory.models';

interface Form {
  id?: string;
  name: string;
  description: string;
  managesFloors: boolean;
  warehouseId: string | null;
  status: 'active' | 'inactive';
}
function emptyForm(): Form {
  return { name: '', description: '', managesFloors: false, warehouseId: null, status: 'active' };
}

@Component({
  selector: 'app-areas',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule],
  template: `
    <section class="ar">
      <header class="top">
        <h1>Áreas de Inventario</h1>
        @if (canCreate) { <button class="new-btn" (click)="openNew()"><i class="pi pi-plus"></i> Nueva Área</button> }
      </header>

      <div class="bar">
        <p-select [options]="statusFilters" optionLabel="label" optionValue="value" [(ngModel)]="statusFilter" placeholder="Todos los estados" styleClass="dk" />
        <span class="spacer"></span>
        <span class="search"><input pInputText placeholder="Buscar áreas..." [(ngModel)]="search" /><i class="pi pi-search"></i></span>
      </div>

      <div class="tablewrap">
        <table class="tbl">
          <thead><tr>
            <th class="num">#</th><th>Nombre</th><th>Descripción</th>
            <th class="cn">Maneja Pisos</th><th class="cn">Items</th><th class="cn">Estado</th><th class="ac">Acciones</th>
          </tr></thead>
          <tbody>
            @for (a of filtered(); track a.id; let i = $index) {
              <tr>
                <td class="num">{{ i + 1 }}</td>
                <td class="nm">{{ a.name }}</td>
                <td class="desc muted">{{ a.description || '—' }}</td>
                <td class="cn"><span class="pill" [class.yes]="a.managesFloors">{{ a.managesFloors ? 'Sí' : 'No' }}</span></td>
                <td class="cn"><span class="pill items">{{ a.itemCount ?? 0 }} items</span></td>
                <td class="cn"><span class="pill" [class.on]="a.status === 'active'" [class.off]="a.status !== 'active'">{{ a.status === 'active' ? 'Activo' : 'Inactivo' }}</span></td>
                <td class="ac">
                  <button class="ia" (click)="openView(a)" title="Ver"><i class="pi pi-eye"></i></button>
                  @if (canEdit) { <button class="ia" (click)="openEdit(a)" title="Editar"><i class="pi pi-pencil"></i></button> }
                  @if (canDelete) { <button class="ia del" (click)="confirmDelete(a)" title="Eliminar"><i class="pi pi-trash"></i></button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="muted center">Sin áreas.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <!-- Nueva / Editar área -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }" [header]="form.id ? 'Editar Área' : 'Nueva Área'" styleClass="dk-dialog">
      <p class="sub">Organiza y jerarquiza tu inventario por áreas.</p>
      <div class="form">
        <div class="fld"><label>Nombre</label><input pInputText [(ngModel)]="form.name" placeholder="Ej: Almacén Principal" /></div>
        <div class="fld"><label>Descripción</label><input pInputText [(ngModel)]="form.description" placeholder="Descripción del área" /></div>
        <div class="fld">
          <label>Almacén vinculado</label>
          <p-select [options]="warehouses()" optionLabel="name" optionValue="id" [(ngModel)]="form.warehouseId" [showClear]="true" placeholder="Sin almacén" styleClass="w" appendTo="body" />
          <small>El conteo de "Items" usa el stock de este almacén.</small>
        </div>
        <label class="toggle">
          <span class="tg-body"><strong><i class="pi pi-building"></i> Maneja Pisos</strong><small>El área se organiza por pisos (p. ej. Habitaciones, Limpieza).</small></span>
          <input type="checkbox" [(ngModel)]="form.managesFloors" />
        </label>
        <div class="fld"><label>Estado</label>
          <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.status" styleClass="w" appendTo="body" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
        <p-button [label]="form.id ? 'Guardar Cambios' : 'Crear Área'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- Ver área -->
    <p-dialog [(visible)]="viewVisible" [modal]="true" [style]="{ width: '28rem' }" [header]="'Área · ' + (viewA?.name || '')" styleClass="dk-dialog">
      @if (viewA; as a) {
        <div class="kv"><span>Nombre</span><strong>{{ a.name }}</strong></div>
        <div class="kv"><span>Descripción</span><strong>{{ a.description || '—' }}</strong></div>
        <div class="kv"><span>Maneja pisos</span><strong>{{ a.managesFloors ? 'Sí' : 'No' }}</strong></div>
        <div class="kv"><span>Almacén</span><strong>{{ a.warehouse?.name || '—' }}</strong></div>
        <div class="kv"><span>Items en stock</span><strong>{{ a.itemCount ?? 0 }}</strong></div>
        <div class="kv"><span>Estado</span><strong>{{ a.status === 'active' ? 'Activo' : 'Inactivo' }}</strong></div>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="viewVisible = false" /></ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .ar { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; }
      h1 { margin: 0; color: #fff; font-size: 1.7rem; }
      .muted { color: #8b97a8; } .center { text-align: center; }
      .new-btn { background: #10b981; color: #04130d; border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; }
      .bar { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1rem; }
      .spacer { flex: 1; }
      :host ::ng-deep .dk { min-width: 200px; }
      .search { position: relative; }
      .search input { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 2.2rem 0.55rem 0.8rem; width: 260px; }
      .search i { position: absolute; right: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .tablewrap { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 820px; }
      .tbl th { text-align: left; padding: 0.85rem 1.1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; font-size: 0.8rem; }
      .tbl td { padding: 0.85rem 1.1rem; border-bottom: 1px solid #16202e; vertical-align: middle; }
      .tbl tr:last-child td { border-bottom: 0; }
      .tbl tr:hover td { background: rgba(255,255,255,0.02); }
      .num { width: 3rem; color: #8b97a8; } th.cn, td.cn { text-align: center; } th.ac, td.ac { text-align: right; white-space: nowrap; }
      .nm { font-weight: 600; color: #fff; }
      .desc { max-width: 380px; }
      .pill { display: inline-block; border-radius: 999px; padding: 0.18rem 0.7rem; font-size: 0.74rem; font-weight: 700; background: #1a2333; color: #9fb0c3; border: 1px solid #2c3a4f; }
      .pill.yes { background: rgba(37,99,235,0.22); color: #60a5fa; border-color: transparent; }
      .pill.items { background: rgba(99,102,241,0.2); color: #a5b4fc; border-color: transparent; }
      .pill.on { background: rgba(16,185,129,0.2); color: #6ee7b7; border-color: transparent; }
      .pill.off { background: rgba(239,68,68,0.18); color: #fca5a5; border-color: transparent; }
      .ia { background: transparent; border: 0; color: #93b3d1; cursor: pointer; padding: 0.35rem; } .ia.del { color: #f87171; } .ia:hover { color: #fff; }
      .sub { margin: 0 0 1rem; color: #9fb0c3; font-size: 0.85rem; }
      .form { display: flex; flex-direction: column; gap: 0.9rem; }
      .form .fld { display: flex; flex-direction: column; gap: 0.35rem; }
      .form label { font-size: 0.82rem; color: #9fb0c3; font-weight: 600; }
      .form small { color: #8b97a8; font-size: 0.76rem; }
      .form input[pInputText] { width: 100%; }
      :host ::ng-deep .form .w { width: 100%; }
      .toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: #131b27; border: 1px solid #243245; border-radius: 12px; padding: 0.85rem 1rem; cursor: pointer; }
      .tg-body { display: flex; flex-direction: column; gap: 0.2rem; }
      .tg-body strong { color: #e6e9ef; font-size: 0.92rem; display: flex; align-items: center; gap: 0.45rem; }
      .tg-body small { color: #9fb0c3; font-size: 0.77rem; }
      .toggle input { width: 20px; height: 20px; accent-color: #10b981; cursor: pointer; }
      .kv { display: flex; justify-content: space-between; padding: 0.45rem 0; border-bottom: 1px solid #16202e; font-size: 0.9rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class AreasComponent implements OnInit {
  private readonly api = inject(CatalogApiService).areas;
  private readonly inv = inject(InventoryApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Area[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly statusOptions = [{ label: 'Activo', value: 'active' }, { label: 'Inactivo', value: 'inactive' }];
  readonly statusFilters = [{ label: 'Todos los estados', value: 'all' }, { label: 'Activo', value: 'active' }, { label: 'Inactivo', value: 'inactive' }];

  search = '';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  dialogVisible = false;
  viewVisible = false;
  viewA: Area | null = null;
  form: Form = emptyForm();

  readonly canCreate = this.auth.can('inventory', 'create');
  readonly canEdit = this.auth.can('inventory', 'edit');
  readonly canDelete = this.auth.can('inventory', 'delete');

  ngOnInit(): void {
    this.reload();
    this.inv.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((r) => this.warehouses.set(r.data ?? []));
  }

  reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 200, sortBy: 'name' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  filtered(): Area[] {
    const q = this.search.toLowerCase();
    return this.items().filter((a) => {
      if (this.statusFilter !== 'all' && a.status !== this.statusFilter) return false;
      if (q && !(a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  openNew(): void { this.form = emptyForm(); this.dialogVisible = true; }
  openView(a: Area): void { this.viewA = a; this.viewVisible = true; }
  openEdit(a: Area): void {
    this.form = {
      id: a.id, name: a.name, description: a.description ?? '',
      managesFloors: !!a.managesFloors, warehouseId: a.warehouseId ?? null,
      status: a.status as 'active' | 'inactive',
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.form.name.trim()) { this.messages.add({ severity: 'warn', summary: 'Falta nombre', detail: 'Indica el nombre del área.' }); return; }
    const dto = {
      name: this.form.name.trim(),
      description: this.form.description,
      managesFloors: this.form.managesFloors,
      warehouseId: this.form.warehouseId ?? '',
      status: this.form.status,
    };
    this.saving.set(true);
    const req$ = this.form.id ? this.api.update(this.form.id, dto) : this.api.create(dto);
    req$.subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.messages.add({ severity: 'success', summary: 'Guardado', detail: 'Área guardada.' }); this.reload(); },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  confirmDelete(a: Area): void {
    this.confirm.confirm({
      header: 'Eliminar área', message: `¿Eliminar "${a.name}"?`, icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.api.remove(a.id).subscribe({
        next: () => { this.messages.add({ severity: 'success', summary: 'Eliminado', detail: 'Área eliminada.' }); this.reload(); },
        error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo eliminar.' }),
      }),
    });
  }
}
