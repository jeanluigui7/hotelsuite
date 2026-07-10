import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type { InventoryCategory } from '../../settings/catalogs/catalog.models';
import { printPdf } from '../../../core/utils/export';

interface Row {
  linenItemId: string;
  code: string;
  name: string;
  type: string;
  color: string | null;
  size: string | null;
  notes: string | null;
  base: number;
  disponible: number;
  transferido: number;
  enUso: number;
  lavanderia: number;
  enProceso: number;
  recibidas: number | null;
  perdidos: number;
  min: number;
  belowStock: boolean;
  barcode: string | null;
  imageUrl: string | null;
  brand: string | null;
  reusable: boolean;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  igvType: string;
  igvPercent: number;
  taxable: boolean;
  salePrice: number;
  cost: number;
  reorderPoint: number;
  receptionReorderPoint: number;
  status: string;
}

const TYPE_LABEL: Record<string, string> = { TOALLA: 'Toallas', SABANA: 'Sabanas', EDREDON: 'Edredones', AMENITY: 'Amenities' };

@Component({
  selector: 'app-almacen-ropa',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <section class="ar">
      <header class="top"><div><h1>Almacén de Ropa</h1><p class="muted">Gestiona los artículos del almacén de ropa</p></div></header>

      <div class="bar">
        <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="search" placeholder="Buscar artículos..." /></div>
        <button class="pill" [class.on]="sortBy === 'code'" (click)="sortBy = 'code'"><i class="pi pi-sort-numeric-down"></i> Código</button>
        <button class="pill" [class.on]="sortBy === 'name'" (click)="sortBy = 'name'"><i class="pi pi-sort-alpha-down"></i> Nombre</button>
        @for (t of types(); track t) {
          <button class="pill" [class.on]="typeFilter === t" (click)="toggleType(t)"><i class="pi pi-inbox"></i> {{ typeLabel(t) }}</button>
        }
        <span class="sp"></span>
        <button class="op reponer" (click)="goRecepcionar()"><i class="pi pi-arrow-right-arrow-left"></i> Recepcionar Ropa Limpia</button>
        <button class="op enviar" (click)="goEnviar()"><i class="pi pi-arrow-right-arrow-left"></i> Enviar Ropa Solicitada</button>
        <button class="op nuevo" (click)="openNew()"><i class="pi pi-plus"></i> Nuevo Artículo</button>
      </div>

      <div class="ops">
        <button class="op2 in" [disabled]="selectedIds().size !== 1" (click)="openIngresar()"><i class="pi pi-plus"></i> Ingresar</button>
        <button class="op2 tr" [disabled]="selectedIds().size === 0" (click)="openTransfer()"><i class="pi pi-arrow-right-arrow-left"></i> Transferencia @if (selectedIds().size) { <span class="cnt">{{ selectedIds().size }}</span> }</button>
        <span class="sp"></span>
        <button class="op2 ghost" (click)="print()"><i class="pi pi-print"></i> Imprimir</button>
        <button class="op2 ghost" [class.on]="lowOnly" (click)="lowOnly = !lowOnly"><i class="pi pi-exclamation-triangle"></i> Bajo Stock</button>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th class="ck"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" title="Seleccionar todos" /></th><th>CÓDIGO</th><th>ARTÍCULO</th><th>CATEGORÍA/TIPO</th>
              <th class="n">STOCK BASE</th><th class="n">STOCK DISP.</th><th class="n">TRANSF.</th><th class="n">EN USO</th><th class="n">LAVANDERÍA</th><th class="n">EN PROCESO</th><th class="n">RECIBIDAS</th><th class="n">PERDIDOS</th><th class="c">ACCIONES</th>
            </tr></thead>
            <tbody>
              @for (r of paged(); track r.linenItemId) {
                <tr [class.low]="r.belowStock">
                  <td class="ck"><input type="checkbox" [checked]="isSel(r.linenItemId)" (change)="toggleSel(r.linenItemId)" /></td>
                  <td class="code">{{ r.code }}<br /><small class="muted">NIU</small></td>
                  <td class="art"><span class="ico"><i class="pi pi-inbox"></i></span> {{ r.name }}</td>
                  <td>{{ typeLabel(r.type) }}<br /><small class="muted">Producto</small></td>
                  <td class="n"><b>{{ r.base }}</b><br /><small class="muted">Base inventario</small></td>
                  <td class="n disp" [class.zero]="r.disponible === 0">{{ r.disponible }}</td>
                  <td class="n tf">{{ r.transferido }}</td>
                  <td class="n eu">{{ r.enUso }}</td>
                  <td class="n lav">{{ r.lavanderia }}</td>
                  <td class="n">{{ r.enProceso }}</td>
                  <td class="n muted">{{ r.recibidas ?? '—' }}</td>
                  <td class="n">{{ r.perdidos }}</td>
                  <td class="c acc">
                    <button class="ic" title="Ingresar" (click)="openIngresar(r.linenItemId)"><i class="pi pi-plus"></i></button>
                    <button class="ic" title="Transferir" (click)="openTransfer(r.linenItemId)"><i class="pi pi-arrow-right-arrow-left"></i></button>
                    <button class="ic" title="Editar" (click)="openEdit(r)"><i class="pi pi-pencil"></i></button>
                    <button class="ic del" title="Desactivar" (click)="remove(r)"><i class="pi pi-trash"></i></button>
                  </td>
                </tr>
              } @empty { <tr><td colspan="13" class="empty">Sin artículos de ropa.</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span class="pg-info">Mostrando {{ pageStart() }}–{{ pageEnd() }} de {{ filtered().length }}</span>
          <span class="sp"></span>
          <button class="pg" [disabled]="page() === 1" (click)="page.set(page() - 1)"><i class="pi pi-chevron-left"></i></button>
          <span class="pg-cur">{{ page() }} / {{ totalPages() }}</span>
          <button class="pg" [disabled]="page() >= totalPages()" (click)="page.set(page() + 1)"><i class="pi pi-chevron-right"></i></button>
          <select class="pg-size" [(ngModel)]="pageSize" (change)="page.set(1)"><option [ngValue]="10">10</option><option [ngValue]="25">25</option><option [ngValue]="50">50</option></select>
        </div>
      }
    </section>

    <!-- Ingreso al central (individual) -->
    <p-dialog [(visible)]="movVisible" [modal]="true" header="Ingresar ropa al central" [style]="{ width: '26rem' }">
      <p class="muted">{{ movRow()?.name }} — disponible central: {{ movRow()?.disponible }}</p>
      <div class="fld"><label>Cantidad</label><p-inputNumber [(ngModel)]="qty" [min]="1" [showButtons]="true" buttonLayout="horizontal" /></div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="movVisible = false" />
        <p-button label="Ingresar" icon="pi pi-check" [loading]="busy()" (onClick)="applyIngresar()" />
      </ng-template>
    </p-dialog>

    <!-- Transferencia masiva: filas = ítems, columnas = pisos -->
    <p-dialog [(visible)]="transferVisible" [modal]="true" header="Transferencia Masiva de Ropa" [style]="{ width: '62rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      <p class="muted">Indica cuánta cantidad de cada ítem enviar a cada piso. Un mismo ítem puede ir a varios pisos en una sola operación.</p>
      @if (floors().length === 0) {
        <p class="empty">No hay pisos definidos en las habitaciones de esta sucursal.</p>
      } @else {
        <div class="mtx-wrap">
          <table class="mtx">
            <thead><tr><th class="it">Ítem</th><th class="n">Disp.</th>@for (f of floors(); track f) { <th class="n">{{ f }}</th> }</tr></thead>
            <tbody>
              @for (it of transferItems; track it.linenItemId) {
                <tr>
                  <td class="it">{{ it.name }}</td>
                  <td class="n" [class.over]="rowSum(it.linenItemId) > it.disponible">{{ rowSum(it.linenItemId) }}/{{ it.disponible }}</td>
                  @for (f of floors(); track f) {
                    <td class="n"><p-inputNumber [(ngModel)]="matrix[it.linenItemId][f]" [min]="0" [showButtons]="false" inputStyleClass="cellq" /></td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (anyOver()) { <p class="over-msg"><i class="pi pi-exclamation-triangle"></i> Hay ítems cuya suma supera el disponible en central.</p> }
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="transferVisible = false" />
        <p-button label="Confirmar Transferencia" icon="pi pi-check" [loading]="busy()" [disabled]="!transferReady()" (onClick)="applyTransfer()" />
      </ng-template>
    </p-dialog>

    <p-dialog [(visible)]="formVisible" [modal]="true" [header]="form.id ? 'Editar Ítem de Ropa' : 'Crear Ítem de Ropa'" [style]="{ width: '46rem', maxWidth: '96vw' }">
      <p class="pf-sub">Registra una prenda reutilizable para control de lavandería, reposiciones y estado.</p>
      <div class="pf">
        <div class="grid2">
          <div class="fld"><label>Código *</label><input pInputText [(ngModel)]="form.code" placeholder="Ej: TOA-001" /><small>Código único de esta unidad de ropa.</small></div>
          <div class="fld"><label>Código de barras (opcional)</label>
            <div class="bc"><input pInputText [(ngModel)]="form.barcode" placeholder="EAN-13, EAN-8, UPC, etc." /><button class="bc-cam" type="button" title="Escanear"><i class="pi pi-camera"></i></button></div>
            <small>Solo si en el futuro deseas escanearla.</small>
          </div>
        </div>
        <div class="fld"><label>Imagen</label>
          <div class="img-row">
            <div class="img-thumb">@if (form.imageUrl) { <img [src]="form.imageUrl" alt="img" /> } @else { <i class="pi pi-image"></i> }</div>
            <label class="img-btn">Seleccionar archivo<input type="file" accept="image/*" (change)="onImage($event)" hidden /></label>
            <span class="img-name">{{ form.imageUrl ? 'Imagen cargada' : 'Ningún archivo seleccionado' }}</span>
          </div>
        </div>
        <div class="grid2">
          <div class="fld"><label>Nombre *</label><input pInputText [(ngModel)]="form.name" placeholder="Ej: Toalla Azul Margarita" /></div>
          <div class="fld"><label>Categoría *</label>
            <p-select [options]="clothingCats()" optionLabel="name" optionValue="id" [(ngModel)]="form.categoryId" (onChange)="onCategoryChange()" placeholder="Selecciona" styleClass="w" appendTo="body" />
            @if (clothingCats().length === 0) { <small class="req">No hay categorías de Ropa. Créalas en Inventario › Configuración › Categorías (Tipo de ítem = Ropa).</small> }
          </div>
        </div>
        <div class="grid2">
          <div class="fld"><label>Tamaño *</label>
            <p-select [options]="sizesForSelected()" [(ngModel)]="form.size" [disabled]="!form.categoryId" placeholder="Selecciona una categoría primero" styleClass="w" appendTo="body" />
            @if (form.categoryId && sizesForSelected().length === 0) { <small class="req">Esta categoría aún no tiene tamaños configurados. Edítala para agregarlos.</small> }
          </div>
          <div class="fld"><label>¿Es reutilizable?</label><label class="chk2 locked"><input type="checkbox" checked disabled /> <span>Sí · Este ítem siempre será reutilizable.</span></label></div>
        </div>
        <div class="fld"><label>Área inicial *</label>
          <p-select [options]="ropaWarehouses()" optionLabel="name" optionValue="id" [(ngModel)]="form.areaId" placeholder="Almacén de Ropa" styleClass="w" appendTo="body" />
          <small>Almacén de ropa de la sede donde se colocará este ítem.</small>
        </div>
        <div class="grid2">
          <div class="fld"><label>Precio de compra *</label><p-inputNumber [(ngModel)]="form.cost" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w" /><small>Se usa para calcular la penalidad si el cliente se lleva o daña la prenda.</small></div>
          <div class="fld"><label>Precio de alquiler *</label><p-inputNumber [(ngModel)]="form.salePrice" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w" /><small>Se cobra cuando la prenda se alquila como adicional al cliente.</small></div>
        </div>
        <div class="fld"><label>Observaciones (opcional)</label><input pInputText [(ngModel)]="form.notes" placeholder="Ej.: Uso exclusivo para habitaciones estándar." /></div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" icon="pi pi-times" [text]="true" (onClick)="formVisible = false" />
        <p-button label="Guardar ítem de ropa" icon="pi pi-save" [loading]="busy()" [disabled]="!formValid()" (onClick)="saveItem()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .ar { padding: 1.4rem; }
      h1 { margin: 0; font-size: 1.5rem; } .muted { color: #8aa0bd; } .empty { text-align: center; padding: 2rem; color: #8aa0bd; }
      .bar, .ops { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin: 0.9rem 0; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.5rem 0.9rem; color: #8aa0bd; min-width: 220px; }
      .search input { background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .pill { display: inline-flex; align-items: center; gap: 0.4rem; background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.45rem 0.8rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
      .pill.on { background: #10b981; color: #04130d; border-color: #10b981; }
      .sp { flex: 1; }
      .op { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; color: #fff; }
      .op.reponer { background: #3b82f6; } .op.enviar { background: #22c55e; color: #04130d; } .op.nuevo { background: #10b981; color: #04130d; }
      .acc .ic.del:hover { color: #f87171; }
      .chk { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.7rem; cursor: pointer; font-size: 0.85rem; }
      :host ::ng-deep .w { width: 100%; }
      .pager { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.8rem; color: #8aa0bd; font-size: 0.82rem; }
      .pg { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.35rem 0.6rem; cursor: pointer; } .pg:disabled { opacity: 0.4; cursor: not-allowed; }
      .pg-cur { font-weight: 700; color: #e2e8f0; }
      .pg-size { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.3rem; }
      .op2 { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid #274468; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; background: transparent; color: #cbd5e1; }
      .op2.in { background: #22c55e; color: #04130d; border: 0; } .op2.tr { background: #6366f1; color: #fff; border: 0; } .op2:disabled { opacity: 0.5; cursor: not-allowed; }
      .op2.ghost.on { background: #78350f; color: #fbbf24; }
      .tbl-wrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.82rem; white-space: nowrap; vertical-align: middle; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.7rem; background: #101a2c; }
      .tbl .n { text-align: right; } .tbl .c { text-align: center; }
      .tbl tr.low { background: rgba(248,113,113,0.06); }
      .code { font-weight: 700; color: #cbd5e1; } .code small, .art small, td small { font-weight: 400; }
      .art { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; } .art .ico { background: #16233a; padding: 0.3rem; border-radius: 6px; color: #8aa0bd; }
      .disp { color: #fbbf24; font-weight: 800; } .disp.zero { color: #f87171; }
      .tf { color: #93c5fd; font-weight: 700; } .eu { color: #a78bfa; font-weight: 700; } .lav { color: #c084fc; font-weight: 700; }
      .acc .ic { background: transparent; border: 0; color: #8aa0bd; cursor: pointer; padding: 0.2rem 0.35rem; } .acc .ic:hover { color: #34d399; }
      .fld { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; } .fld label { font-size: 0.8rem; color: #8aa0bd; }
      .fld input { width: 100%; }
      .cnt { background: #04130d; color: #34d399; border-radius: 999px; font-size: 0.7rem; font-weight: 800; padding: 0.05rem 0.4rem; margin-left: 0.2rem; }
      .mtx-wrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 10px; margin-top: 0.6rem; }
      .mtx { border-collapse: collapse; width: 100%; }
      .mtx th, .mtx td { padding: 0.5rem 0.6rem; border-bottom: 1px solid #16233a; font-size: 0.82rem; white-space: nowrap; }
      .mtx th { color: #8aa0bd; font-weight: 600; font-size: 0.72rem; background: #101a2c; text-align: right; }
      .mtx th.it { text-align: left; } .mtx td.it { font-weight: 600; }
      .mtx .n { text-align: right; } .mtx td.n.over { color: #f87171; font-weight: 800; }
      :host ::ng-deep .cellq { width: 4.2rem; text-align: center; }
      .over-msg { color: #f87171; font-size: 0.82rem; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
    `,
  ],
})
export class AlmacenRopaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);
  private readonly api = environment.apiUrl;

  readonly rows = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly floors = signal<string[]>([]);

  search = '';
  sortBy: 'code' | 'name' = 'code';
  typeFilter: string | null = null;
  lowOnly = false;

  // Ingreso individual al central
  movVisible = false;
  movItemId: string | null = null;
  qty: number | null = 1;

  // Transferencia masiva (ítems × pisos)
  transferVisible = false;
  transferItems: { linenItemId: string; name: string; disponible: number }[] = [];
  matrix: Record<string, Record<string, number | null>> = {};

  formVisible = false;
  form: {
    id?: string; code: string; barcode: string; imageUrl: string; name: string;
    categoryId: string | null; size: string | null; cost: number; salePrice: number; notes: string; areaId: string | null;
  } = this.emptyForm();
  /** Categorías tipo Ropa (con sus tamaños) y almacenes de ropa (para "Área inicial"). */
  readonly clothingCats = signal<InventoryCategory[]>([]);
  readonly ropaWarehouses = signal<{ id: string; name: string }[]>([]);
  private emptyForm() {
    return { code: '', barcode: '', imageUrl: '', name: '', categoryId: null as string | null, size: null as string | null, cost: 0, salePrice: 0, notes: '', areaId: null as string | null };
  }
  /** Tamaños disponibles = los de la categoría (Ropa) elegida. */
  sizesForSelected(): string[] { return this.clothingCats().find((c) => c.id === this.form.categoryId)?.sizes ?? []; }
  onCategoryChange(): void { this.form.size = null; }
  formValid(): boolean { return !!this.form.code?.trim() && !!this.form.name?.trim() && !!this.form.categoryId && !!this.form.size && !!this.form.areaId; }
  onImage(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) { this.toast.add({ severity: 'warn', summary: 'Imagen muy grande', detail: 'Máximo 8 MB.' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        c.width = img.width * scale; c.height = img.height * scale;
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        this.form.imageUrl = c.toDataURL('image/jpeg', 0.7);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  ngOnInit(): void {
    this.reload();
    // Solo categorías tipo Ropa (con sus tamaños) para el formulario de ítem de ropa.
    this.http.get<ApiResponse<InventoryCategory[]>>(`${this.api}/inventory-categories`, { params: { pageSize: '200', sortBy: 'name' } })
      .subscribe((r) => this.clothingCats.set((r.data ?? []).filter((c) => c.type === 'CLOTHING' && c.status === 'active')));
    // Almacenes de ropa (CLOTHING) para "Área inicial".
    this.http.get<ApiResponse<{ id: string; name: string; type: string }[]>>(`${this.api}/warehouses`, { params: { pageSize: '100', sortBy: 'name' } })
      .subscribe((r) => this.ropaWarehouses.set((r.data ?? []).filter((w) => w.type === 'CLOTHING').map((w) => ({ id: w.id, name: w.name }))));
    // Destinos = subalmacenes configurados del almacén ROPA - LIMPIEZA (pisos o torres según la sede).
    this.http.get<ApiResponse<{ subWarehouses: { id: string; name: string }[] }>>(`${this.api}/subwarehouses/linen-area`)
      .subscribe({ next: (r) => this.floors.set((r.data?.subWarehouses ?? []).map((s) => s.name)), error: () => {} });
  }

  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }

  // ── Selección múltiple ──
  isSel(id: string): boolean { return this.selectedIds().has(id); }
  toggleSel(id: string): void { const s = new Set(this.selectedIds()); s.has(id) ? s.delete(id) : s.add(id); this.selectedIds.set(s); }
  allSelected(): boolean { const f = this.filtered(); return f.length > 0 && f.every((r) => this.selectedIds().has(r.linenItemId)); }
  toggleAll(): void {
    const f = this.filtered();
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(f.map((r) => r.linenItemId)));
  }

  toggleType(t: string): void { this.typeFilter = this.typeFilter === t ? null : t; }

  /** Tipos reales presentes (los ítems guardan como `type` el nombre de su categoría). */
  types(): string[] {
    return [...new Set(this.rows().map((r) => r.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  }

  filtered(): Row[] {
    const q = this.search.trim().toLowerCase();
    return this.rows()
      .filter((r) => !this.typeFilter || r.type === this.typeFilter)
      .filter((r) => !this.lowOnly || r.belowStock)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
      .sort((a, b) => (this.sortBy === 'name' ? a.name.localeCompare(b.name) : a.code.localeCompare(b.code)));
  }

  // ── Paginación ──
  readonly page = signal(1);
  pageSize = 10;
  totalPages(): number { return Math.max(1, Math.ceil(this.filtered().length / this.pageSize)); }
  paged(): Row[] {
    const p = Math.min(this.page(), this.totalPages());
    if (p !== this.page()) queueMicrotask(() => this.page.set(p));
    const start = (p - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  }
  pageStart(): number { return this.filtered().length === 0 ? 0 : (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize + 1; }
  pageEnd(): number { return Math.min(this.filtered().length, Math.min(this.page(), this.totalPages()) * this.pageSize); }

  reload(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<Row[]>>(`${this.api}/admin/linen/warehouse`).subscribe({
      next: (r) => { this.rows.set(r.data ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el almacén de ropa.' }); },
    });
  }

  // ── Ingreso individual al central ──
  movRow(): Row | undefined { return this.rows().find((r) => r.linenItemId === this.movItemId); }
  openIngresar(id?: string): void {
    const target = id ?? [...this.selectedIds()][0];
    if (!target) return;
    this.movItemId = target; this.qty = 1; this.movVisible = true;
  }
  applyIngresar(): void {
    const id = this.movItemId;
    if (!id || !this.qty || this.qty <= 0) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/replenish`, { linenItemId: id, quantity: this.qty }).subscribe({
      next: () => { this.busy.set(false); this.movVisible = false; this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Ropa ingresada.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo completar.' }); },
    });
  }

  // ── Transferencia masiva (matriz ítems × pisos) ──
  openTransfer(id?: string): void {
    const ids = id ? [id] : [...this.selectedIds()];
    if (!ids.length) return;
    const byId = new Map(this.rows().map((r) => [r.linenItemId, r]));
    this.transferItems = ids.map((i) => byId.get(i)).filter((r): r is Row => !!r).map((r) => ({ linenItemId: r.linenItemId, name: r.name, disponible: r.disponible }));
    // Inicializa la matriz (cada ítem × cada piso en null).
    this.matrix = {};
    for (const it of this.transferItems) { this.matrix[it.linenItemId] = {}; for (const f of this.floors()) this.matrix[it.linenItemId][f] = null; }
    this.transferVisible = true;
  }
  rowSum(id: string): number { const m = this.matrix[id] ?? {}; return Object.values(m).reduce((a: number, v) => a + (Number(v) || 0), 0); }
  anyOver(): boolean { return this.transferItems.some((it) => this.rowSum(it.linenItemId) > it.disponible); }
  transferReady(): boolean { return !this.anyOver() && this.transferItems.some((it) => this.rowSum(it.linenItemId) > 0); }
  applyTransfer(): void {
    if (!this.transferReady()) return;
    const rows: { linenItemId: string; toFloor: string; quantity: number }[] = [];
    for (const it of this.transferItems) {
      for (const f of this.floors()) {
        const q = Number(this.matrix[it.linenItemId]?.[f]) || 0;
        if (q > 0) rows.push({ linenItemId: it.linenItemId, toFloor: f, quantity: q });
      }
    }
    if (!rows.length) return;
    this.busy.set(true);
    this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/transfer-bulk`, { rows }).subscribe({
      next: () => {
        this.busy.set(false); this.transferVisible = false; this.selectedIds.set(new Set());
        this.toast.add({ severity: 'success', summary: 'Transferencia', detail: `${rows.length} envío(s) realizados.` });
        this.reload();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo transferir.' }); },
    });
  }

  openNew(): void { this.form = this.emptyForm(); this.form.areaId = this.ropaWarehouses()[0]?.id ?? null; this.formVisible = true; }
  openEdit(r: Row): void {
    this.form = {
      id: r.linenItemId, code: r.code ?? '', barcode: r.barcode ?? '', imageUrl: r.imageUrl ?? '', name: r.name,
      categoryId: r.categoryId ?? null, size: r.size ?? null, cost: r.cost ?? 0, salePrice: r.salePrice ?? 0,
      notes: r.notes ?? '', areaId: this.ropaWarehouses()[0]?.id ?? null,
    };
    this.formVisible = true;
  }
  saveItem(): void {
    if (!this.formValid()) { this.toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa Código, Nombre, Categoría, Tamaño y Área inicial.' }); return; }
    this.busy.set(true);
    // La ropa es siempre reutilizable; el tipo de prenda lo define la Categoría (backend).
    const body = {
      name: this.form.name.trim(),
      code: this.form.code || undefined, barcode: this.form.barcode || undefined, imageUrl: this.form.imageUrl || undefined,
      categoryId: this.form.categoryId, size: this.form.size, reusable: true,
      salePrice: this.form.salePrice, cost: this.form.cost, notes: this.form.notes || undefined,
    };
    const req$ = this.form.id
      ? this.http.put<ApiResponse<unknown>>(`${this.api}/admin/linen/items/${this.form.id}`, body)
      : this.http.post<ApiResponse<unknown>>(`${this.api}/admin/linen/items`, body);
    req$.subscribe({
      next: () => { this.busy.set(false); this.formVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Ítem de ropa guardado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
  remove(r: Row): void {
    if (!confirm(`¿Desactivar "${r.name}"? Dejará de aparecer en el almacén.`)) return;
    this.http.delete<ApiResponse<unknown>>(`${this.api}/admin/linen/items/${r.linenItemId}`).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Desactivado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo desactivar.' }),
    });
  }

  goRecepcionar(): void { void this.router.navigateByUrl('/operations/lavanderia-ropa'); }
  goEnviar(): void { void this.router.navigateByUrl('/operations/transferencia-ropa'); }

  print(): void {
    const body = `<table><thead><tr><th>Código</th><th>Artículo</th><th>Tipo</th><th class="num">Base</th><th class="num">Disp</th><th class="num">Transf</th><th class="num">En uso</th><th class="num">Lavand.</th></tr></thead><tbody>${
      this.filtered().map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${this.typeLabel(r.type)}</td><td class="num">${r.base}</td><td class="num">${r.disponible}</td><td class="num">${r.transferido}</td><td class="num">${r.enUso}</td><td class="num">${r.lavanderia}</td></tr>`).join('')
    }</tbody></table>`;
    printPdf('Almacén de Ropa · RIZZOS', body);
  }
}
