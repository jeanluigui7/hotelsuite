import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { printPdf } from '../../../core/utils/export';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product, Warehouse } from '../../inventory/services/inventory.models';

interface Req { id: string; status: string; createdAt: string; items: { productId: string; name: string; quantity: number }[]; }
interface Form { id?: string; name: string; sku: string; categoryId: string | null; salePrice: number; cost: number; reorderPoint: number; status: 'active' | 'inactive'; stock: number; }

@Component({
  selector: 'app-almacen-productos',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ButtonModule, DialogModule, SelectModule, InputNumberModule, InputTextModule],
  template: `
    <section class="ap">
      <header class="top">
        <div><h1>Almacén de Productos</h1><p class="muted">Gestiona los artículos del almacén de productos</p></div>
      </header>

      <div class="banner"><i class="pi pi-check-circle"></i> <span><strong>Operaciones masivas habilitadas</strong> para Almacén de Productos. Selecciona items en la tabla y usa los botones de operaciones.</span></div>

      <div class="bar">
        <span class="search"><i class="pi pi-search"></i><input pInputText placeholder="Buscar artículos..." [(ngModel)]="search" /></span>
        <button class="sortb" [class.on]="sortBy === 'sku'" (click)="sortBy = 'sku'"><i class="pi pi-arrow-up"></i> Código</button>
        <button class="sortb" [class.on]="sortBy === 'name'" (click)="sortBy = 'name'"><i class="pi pi-sort-alt"></i> Nombre</button>
        <span class="spacer"></span>
        <button class="act green" (click)="openEnviar()"><i class="pi pi-arrows-h"></i> Enviar Productos</button>
        <button class="act green" (click)="openNew()"><i class="pi pi-plus"></i> Nuevo Artículo</button>
      </div>

      <div class="filters">
        <p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" [(ngModel)]="categoryFilter" placeholder="Todas las Categorías" [showClear]="true" styleClass="dk" />
        <p-select [options]="tipoOptions" [(ngModel)]="tipoFilter" placeholder="Todos los Tipos" [showClear]="true" styleClass="dk" />
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="statusFilter" placeholder="Productos Activos" styleClass="dk" />
      </div>

      <div class="ops">
        <button class="op in" (click)="openMov('IN')" [disabled]="selected().size === 0"><i class="pi pi-plus"></i> Ingresar</button>
        <button class="op out" (click)="openMov('OUT')" [disabled]="selected().size === 0"><i class="pi pi-trash"></i> Dar de Baja</button>
        <button class="op" (click)="goTransfer()"><i class="pi pi-arrows-h"></i> Transferencia</button>
        <span class="spacer"></span>
        <button class="op" (click)="selectAll()"><i class="pi pi-check-square"></i> Seleccionar Todo</button>
        <button class="op" (click)="print()"><i class="pi pi-print"></i> Imprimir</button>
        <button class="op" [class.on]="lowStockOnly" (click)="lowStockOnly = !lowStockOnly"><i class="pi pi-exclamation-triangle"></i> Bajo Stock</button>
      </div>

      <div class="tablewrap">
        <table class="tbl">
          <thead><tr>
            <th class="ck"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" /> TODO</th>
            <th>CÓDIGO</th><th>ARTÍCULO</th><th>CATEGORÍA/TIPO</th><th>PRECIOS (S/)</th><th>STOCK ACTUAL</th><th class="ac">ACCIONES</th>
          </tr></thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr [class.sel]="selected().has(p.id)" [class.low-row]="isLow(p)">
                <td class="ck"><input type="checkbox" [checked]="selected().has(p.id)" (change)="toggle(p.id)" /></td>
                <td class="code"><strong>{{ p.sku || '—' }}</strong><span class="niu">NIU</span></td>
                <td class="art"><span class="ico"><i class="pi pi-box"></i></span> {{ p.name }}</td>
                <td><div>{{ p.category?.name || 'Sin categoría' }}</div><small class="muted">Producto</small></td>
                <td><div>Venta: S/{{ +p.salePrice | number: '1.2-2' }}</div><small class="muted">Compra: S/{{ +(p.cost || 0) | number: '1.2-2' }}</small></td>
                <td><div [class.low]="isLow(p)">{{ p.stock }}</div><small class="muted">Mín: {{ p.reorderPoint }}</small></td>
                <td class="ac">
                  <button class="ia" (click)="openView(p)" title="Ver"><i class="pi pi-eye"></i></button>
                  <button class="ia" (click)="openEdit(p)" title="Editar"><i class="pi pi-pencil"></i></button>
                  <button class="ia del" (click)="confirmDelete(p)" title="Eliminar"><i class="pi pi-trash"></i></button>
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="muted center">Sin artículos.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <!-- Nuevo / Editar artículo -->
    <p-dialog [(visible)]="formVisible" [modal]="true" [header]="form.id ? 'Editar artículo' : 'Nuevo artículo'" [style]="{ width: '32rem' }" styleClass="dk-dialog">
      <div class="f-grid">
        <div class="fld span2"><label>Nombre</label><input pInputText [(ngModel)]="form.name" /></div>
        <div class="fld"><label>Código (SKU)</label><input pInputText [(ngModel)]="form.sku" placeholder="PROD-001" /></div>
        <div class="fld"><label>Categoría</label><p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" [(ngModel)]="form.categoryId" [showClear]="true" placeholder="Sin categoría" styleClass="w" /></div>
        <div class="fld"><label>Precio venta</label><p-inputNumber [(ngModel)]="form.salePrice" mode="decimal" [minFractionDigits]="2" [min]="0" /></div>
        <div class="fld"><label>Precio compra</label><p-inputNumber [(ngModel)]="form.cost" mode="decimal" [minFractionDigits]="2" [min]="0" /></div>
        <div class="fld"><label>Stock mínimo</label><p-inputNumber [(ngModel)]="form.reorderPoint" [min]="0" /></div>
        <div class="fld"><label>Stock inicial</label><p-inputNumber [(ngModel)]="form.stock" [min]="0" [disabled]="!!form.id" /></div>
      </div>
      <ng-template pTemplate="footer"><p-button label="Cancelar" [text]="true" (onClick)="formVisible = false" /><p-button label="Guardar" icon="pi pi-check" [loading]="busy()" (onClick)="save()" /></ng-template>
    </p-dialog>

    <!-- Ingresar / Dar de baja -->
    <p-dialog [(visible)]="movVisible" [modal]="true" [header]="movType === 'IN' ? 'Ingresar stock' : 'Dar de baja'" [style]="{ width: '26rem' }" styleClass="dk-dialog">
      <p class="muted">{{ selected().size }} artículo(s) seleccionado(s).</p>
      <div class="fld"><label>Cantidad ({{ movType === 'IN' ? '+' : '−' }})</label><p-inputNumber [(ngModel)]="movQty" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
      <div class="fld"><label>Motivo / referencia</label><input pInputText [(ngModel)]="movRef" placeholder="Ingreso / merma / ajuste" /></div>
      <ng-template pTemplate="footer"><p-button label="Cancelar" [text]="true" (onClick)="movVisible = false" /><p-button [label]="movType === 'IN' ? 'Ingresar' : 'Dar de baja'" icon="pi pi-check" [loading]="busy()" (onClick)="applyMov()" /></ng-template>
    </p-dialog>

    <!-- Ver -->
    <p-dialog [(visible)]="viewVisible" [modal]="true" [header]="'Artículo · ' + (viewP?.sku || '')" [style]="{ width: '24rem' }" styleClass="dk-dialog">
      @if (viewP; as p) {
        <div class="kv"><span>Nombre</span><strong>{{ p.name }}</strong></div>
        <div class="kv"><span>Categoría</span><strong>{{ p.category?.name || '—' }}</strong></div>
        <div class="kv"><span>Precio venta</span><strong>S/ {{ +p.salePrice | number: '1.2-2' }}</strong></div>
        <div class="kv"><span>Precio compra</span><strong>S/ {{ +(p.cost || 0) | number: '1.2-2' }}</strong></div>
        <div class="kv"><span>Stock actual</span><strong>{{ p.stock }}</strong></div>
        <div class="kv"><span>Stock mínimo</span><strong>{{ p.reorderPoint }}</strong></div>
      }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="viewVisible = false" /></ng-template>
    </p-dialog>

    <!-- Enviar productos (solicitudes a recepción) -->
    <p-dialog [(visible)]="enviarVisible" [modal]="true" header="Enviar productos a Recepción" [style]="{ width: '34rem' }" styleClass="dk-dialog">
      <h4>Solicitudes por enviar</h4>
      @for (r of pending(); track r.id) {
        <div class="req"><div class="items">@for (i of r.items; track i.productId) { <span class="rchip">{{ i.name }} x{{ i.quantity }}</span> }</div>
          <p-button label="Enviar" icon="pi pi-send" size="small" [loading]="busy()" (onClick)="send(r)" /></div>
      } @empty { <p class="muted">No hay solicitudes pendientes de Recepción.</p> }
      <ng-template pTemplate="footer"><p-button label="Cerrar" [text]="true" (onClick)="enviarVisible = false" /></ng-template>
    </p-dialog>

    <!-- Transferencia Masiva de Productos -->
    <p-dialog [(visible)]="transferVisible" [modal]="true" [style]="{ width: '34rem' }" styleClass="dk-dialog">
      <ng-template pTemplate="header"><span class="th"><i class="pi pi-arrow-right-arrow-left"></i> Transferencia Masiva de Productos</span></ng-template>
      <p class="muted">Transfiriendo {{ transferLines.length }} producto(s)</p>
      <div class="fld"><label>Área Destino:</label>
        <label class="radio"><input type="radio" name="tarea" value="RECEPTION" [(ngModel)]="transferArea" /> <span>Recepción</span></label>
        <label class="radio"><input type="radio" name="tarea" value="FRIGOBAR" [(ngModel)]="transferArea" /> <span>Almacén Frigobar</span></label>
      </div>
      @for (l of transferLines; track l.productId) {
        <div class="tline">
          <div><div class="tn">{{ l.name }}</div><div class="ts">Stock {{ l.stock }}</div></div>
          <p-inputNumber [(ngModel)]="l.qty" [min]="1" [max]="l.stock" [showButtons]="false" inputStyleClass="tqty" />
          <button class="tx" (click)="removeTransferLine(l.productId)"><i class="pi pi-times"></i></button>
        </div>
      }
      <div class="fld"><label>Notas (opcional)</label><textarea class="ta" rows="2" [(ngModel)]="transferNotes" placeholder="Notas adicionales (opcional)"></textarea></div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="transferVisible = false" />
        <p-button label="Confirmar Transferencia" icon="pi pi-arrow-right-arrow-left" [loading]="busy()" [disabled]="transferLines.length === 0" (onClick)="applyTransfer()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .ap { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; font-size: 1.5rem; } .muted { color: #8b97a8; } .center { text-align: center; }
      .banner { background: rgba(16,185,129,0.1); border: 1px solid #14633f; color: #6ee7b7; border-radius: 10px; padding: 0.7rem 1rem; margin: 0.8rem 0; display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; }
      .th { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700; } .th .pi { color: #3b82f6; }
      .radio { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0; cursor: pointer; font-weight: 500; }
      .tline { display: flex; align-items: center; gap: 0.7rem; background: #0f1a2b; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.7rem 0.9rem; margin: 0.5rem 0; }
      .tline > div:first-child { flex: 1; } .tn { font-weight: 700; } .ts { color: #8b97a8; font-size: 0.8rem; }
      :host ::ng-deep .tqty { width: 5rem; text-align: center; }
      .tx { background: transparent; border: 0; color: #f87171; cursor: pointer; font-size: 1rem; }
      .ta { width: 100%; background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e6e9ef; padding: 0.6rem; resize: vertical; }
      .bar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
      .search { position: relative; } .search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .search input { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 0.7rem 0.55rem 2rem; width: 240px; }
      .sortb { background: #0f3d2e; border: 1px solid #14633f; color: #6ee7b7; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.82rem; }
      .sortb.on { background: #10b981; color: #04130d; font-weight: 700; }
      .spacer { flex: 1; }
      .act { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-weight: 700; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .act.green { background: #10b981; color: #04130d; }
      .filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
      :host ::ng-deep .dk .p-select { background: #131b27; border-color: #243245; min-width: 220px; }
      .ops { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
      .op { background: #131b27; border: 1px solid #243245; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .op.in { border-color: #14633f; color: #6ee7b7; } .op.out { border-color: #7f1d1d; color: #fca5a5; } .op.on { background: #1e3a8a; color: #93c5fd; }
      .op:disabled { opacity: 0.45; cursor: not-allowed; }
      .tablewrap { overflow-x: auto; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.85rem; min-width: 900px; }
      .tbl th { text-align: left; padding: 0.8rem 1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; background: #101a28; font-size: 0.75rem; }
      .tbl td { padding: 0.7rem 1rem; border-bottom: 1px solid #16202e; vertical-align: top; }
      .tbl tr.sel { background: rgba(16,185,129,0.06); }
      .tbl tr.low-row { background: rgba(239,68,68,0.09); }
      .tbl tr.low-row:hover { background: rgba(239,68,68,0.14); }
      .tbl tr.low-row.sel { background: rgba(239,68,68,0.16); }
      .ck { width: 5rem; } .code strong { display: block; } .niu { font-size: 0.7rem; color: #8b97a8; }
      .art { font-weight: 600; } .art .ico { background: #1a2333; padding: 0.3rem; border-radius: 6px; margin-right: 0.4rem; color: #8b97a8; }
      .low { color: #f87171; font-weight: 700; }
      .ac { white-space: nowrap; } th.ac { text-align: right; }
      .ia { background: transparent; border: 0; color: #93b3d1; cursor: pointer; padding: 0.3rem; } .ia.del { color: #f87171; } .ia:hover { color: #fff; }
      .f-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; } .f-grid .span2 { grid-column: 1 / -1; }
      .fld { display: flex; flex-direction: column; gap: 0.3rem; } label { font-size: 0.82rem; color: #9fb0c3; }
      :host ::ng-deep .fld input, :host ::ng-deep .fld .p-inputnumber, :host ::ng-deep .fld .p-select, :host ::ng-deep .w .p-select { width: 100%; }
      .kv { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #16202e; font-size: 0.9rem; }
      .req { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid #1f2a3a; border-radius: 10px; padding: 0.6rem 0.9rem; margin-bottom: 0.5rem; }
      .rchip { background: #131b27; border: 1px solid #243245; border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.78rem; margin-right: 0.3rem; }
      h4 { margin: 0 0 0.6rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class AlmacenProductosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly inventory = inject(InventoryApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly router = inject(Router);

  readonly products = signal<Product[]>([]);
  readonly requests = signal<Req[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  private warehouseId: string | null = null;

  search = '';
  sortBy: 'sku' | 'name' = 'sku';
  categoryFilter: string | null = null;
  tipoFilter: string | null = null;
  statusFilter = 'active';
  lowStockOnly = false;
  readonly tipoOptions = ['Producto'];
  readonly statusOptions = [{ label: 'Productos Activos', value: 'active' }, { label: 'Inactivos', value: 'inactive' }, { label: 'Todos', value: 'all' }];

  formVisible = false;
  form: Form = this.emptyForm();
  movVisible = false;
  movType: 'IN' | 'OUT' = 'IN';
  movQty = 1;
  movRef = '';
  viewVisible = false;
  viewP: Product | null = null;
  enviarVisible = false;

  readonly pending = computed(() => this.requests().filter((r) => r.status === 'REQUESTED' || r.status === 'PENDING'));

  readonly categoryOptions = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.products()) if (p.category) map.set(p.category.id, p.category.name);
    return [...map].map(([value, label]) => ({ label, value }));
  });

  /** Stock bajo: hay un mínimo definido y la cantidad actual está en o por debajo de él. */
  isLow(p: Product): boolean {
    return p.reorderPoint > 0 && p.stock <= p.reorderPoint;
  }

  // Método (no computed) para reaccionar a los filtros con props no-signal.
  filtered(): Product[] {
    const q = this.search.toLowerCase();
    const list = this.products().filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))) return false;
      if (this.categoryFilter && p.categoryId !== this.categoryFilter) return false;
      if (this.statusFilter !== 'all' && p.status !== this.statusFilter) return false;
      if (this.lowStockOnly && !this.isLow(p)) return false;
      return true;
    });
    return [...list].sort((a, b) =>
      this.sortBy === 'sku' ? (a.sku ?? '').localeCompare(b.sku ?? '') : a.name.localeCompare(b.name),
    );
  }

  ngOnInit(): void {
    this.reload();
    this.inventory.warehouses.list({ pageSize: 50 }).subscribe((r) => {
      const ws = r.data ?? [];
      this.warehouseId = ws.find((w: Warehouse) => w.type === 'PRODUCTS')?.id ?? ws[0]?.id ?? null;
    });
  }

  reload(): void {
    this.inventory.products.list({ pageSize: 300 }).subscribe((r) => this.products.set(r.data ?? []));
    this.http.get<ApiResponse<Req[]>>(`${this.api}/reception-inventory/requests`).subscribe((r) => this.requests.set(r.data ?? []));
  }

  private emptyForm(): Form { return { name: '', sku: '', categoryId: null, salePrice: 0, cost: 0, reorderPoint: 0, status: 'active', stock: 0 }; }

  // Selección
  toggle(id: string): void { const s = new Set(this.selected()); if (s.has(id)) s.delete(id); else s.add(id); this.selected.set(s); }
  allSelected(): boolean { const f = this.filtered(); return f.length > 0 && f.every((p) => this.selected().has(p.id)); }
  toggleAll(): void { this.selected.set(this.allSelected() ? new Set() : new Set(this.filtered().map((p) => p.id))); }
  selectAll(): void { this.selected.set(new Set(this.filtered().map((p) => p.id))); }

  // CRUD
  openNew(): void { this.form = this.emptyForm(); this.formVisible = true; }
  openEdit(p: Product): void {
    this.form = { id: p.id, name: p.name, sku: p.sku ?? '', categoryId: p.categoryId ?? null, salePrice: Number(p.salePrice), cost: Number(p.cost ?? 0), reorderPoint: p.reorderPoint, status: p.status as 'active' | 'inactive', stock: p.stock };
    this.formVisible = true;
  }
  openView(p: Product): void { this.viewP = p; this.viewVisible = true; }

  save(): void {
    if (!this.form.name) { this.toast.add({ severity: 'warn', summary: 'Falta nombre', detail: '' }); return; }
    this.busy.set(true);
    const dto = { name: this.form.name, sku: this.form.sku || undefined, categoryId: this.form.categoryId, salePrice: this.form.salePrice, cost: this.form.cost, reorderPoint: this.form.reorderPoint, status: this.form.status, stock: this.form.id ? undefined : this.form.stock };
    const req$ = this.form.id ? this.inventory.products.update(this.form.id, dto) : this.inventory.products.create(dto);
    req$.subscribe({
      next: () => { this.busy.set(false); this.formVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Artículo guardado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }

  confirmDelete(p: Product): void {
    this.confirm.confirm({
      header: 'Eliminar artículo', message: `¿Eliminar "${p.name}"?`, icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.inventory.products.remove(p.id).subscribe({
        next: () => { this.toast.add({ severity: 'success', summary: 'Eliminado', detail: '' }); this.reload(); },
        error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }),
      }),
    });
  }

  // Movimientos (Ingresar / Dar de baja) sobre los seleccionados
  openMov(type: 'IN' | 'OUT'): void { this.movType = type; this.movQty = 1; this.movRef = ''; this.movVisible = true; }
  applyMov(): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.busy.set(true);
    const qty = this.movType === 'IN' ? this.movQty : -this.movQty;
    const byId = new Map(this.products().map((p) => [p.id, p]));
    const send = (i: number): void => {
      if (i >= ids.length) { this.busy.set(false); this.movVisible = false; this.selected.set(new Set()); this.toast.add({ severity: 'success', summary: 'Listo', detail: `${ids.length} artículo(s) actualizados.` }); this.reload(); return; }
      // Ajusta en el MISMO almacén cuyo stock se muestra (el que trae cada producto),
      // así el listado siempre refleja el ingreso aunque haya varios almacenes PRODUCTS.
      const wh = byId.get(ids[i])?.warehouseId ?? this.warehouseId;
      if (!wh) { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Sin almacén', detail: 'No hay almacén de productos.' }); return; }
      this.inventory.adjust({ productId: ids[i], warehouseId: wh, quantity: qty, reference: this.movRef || (this.movType === 'IN' ? 'Ingreso' : 'Baja') }).subscribe({
        next: () => send(i + 1),
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
      });
    };
    send(0);
  }

  // ── Transferencia masiva (a Recepción / Frigobar) ──
  transferVisible = false;
  transferArea: 'RECEPTION' | 'FRIGOBAR' = 'RECEPTION';
  transferNotes = '';
  transferLines: { productId: string; name: string; stock: number; qty: number }[] = [];

  goTransfer(): void {
    const ids = [...this.selected()];
    const source = ids.length ? this.products().filter((p) => this.selected().has(p.id)) : this.filtered();
    this.transferLines = source.map((p) => ({ productId: p.id, name: p.name, stock: p.stock, qty: 1 }));
    if (!this.transferLines.length) { this.toast.add({ severity: 'warn', summary: 'Sin productos', detail: 'Selecciona al menos un producto.' }); return; }
    this.transferArea = 'RECEPTION';
    this.transferNotes = '';
    this.transferVisible = true;
  }

  removeTransferLine(id: string): void { this.transferLines = this.transferLines.filter((l) => l.productId !== id); }

  applyTransfer(): void {
    const lines = this.transferLines.filter((l) => l.qty > 0);
    if (!lines.length) return;
    this.busy.set(true);
    const send = (i: number): void => {
      if (i >= lines.length) {
        this.busy.set(false); this.transferVisible = false; this.selected.set(new Set());
        this.toast.add({ severity: 'success', summary: 'Transferencia realizada', detail: `${lines.length} producto(s) enviados a ${this.transferArea === 'RECEPTION' ? 'Recepción' : 'Almacén Frigobar'}.` });
        this.reload(); return;
      }
      this.inventory.transferArea({ productId: lines[i].productId, quantity: lines[i].qty, toArea: this.transferArea, reference: this.transferNotes || undefined }).subscribe({
        next: () => send(i + 1),
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo transferir.' }); },
      });
    };
    send(0);
  }

  print(): void {
    const body = `<table><thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th class="num">Venta</th><th class="num">Compra</th><th class="num">Stock</th></tr></thead><tbody>${
      this.filtered().map((p) => `<tr><td>${p.sku ?? ''}</td><td>${p.name}</td><td>${p.category?.name ?? ''}</td><td class="num">${(+p.salePrice).toFixed(2)}</td><td class="num">${(+(p.cost || 0)).toFixed(2)}</td><td class="num">${p.stock}</td></tr>`).join('')
    }</tbody></table>`;
    printPdf('Almacén de Productos · RIZZOS', body);
  }

  // Enviar a recepción
  openEnviar(): void { this.enviarVisible = true; }
  send(r: Req): void {
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/reception-inventory/requests/${r.id}/send`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.add({ severity: 'success', summary: 'Enviado a recepción', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Error.' }); },
    });
  }
}
