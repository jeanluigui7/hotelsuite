import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product, Warehouse, WarehouseStock } from '../../inventory/services/inventory.models';
import { printPdf } from '../../../core/utils/export';

const LIMP_NAME = 'AMENITIES - LIMPIEZA';

interface Cat { id: string; name: string; type?: string; status?: string }

@Component({
  selector: 'app-almacen-amenities',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule],
  template: `
    <section class="ar">
      <header class="top">
        <div><h1>Almacén de Amenities</h1><p class="muted">Gestiona los artículos del almacén de amenities. Desde aquí se crean, eliminan y transfieren hacia AMENITIES - LIMPIEZA.</p></div>
      </header>

      <div class="banner"><i class="pi pi-check-circle"></i> Operaciones masivas habilitadas para <b>Almacén de Amenities</b>. Selecciona ítems en la tabla y usa los botones de operaciones.</div>

      <div class="bar">
        <div class="search"><i class="pi pi-search"></i><input [(ngModel)]="search" placeholder="Buscar artículos..." /></div>
        <button class="pill" [class.on]="sortBy === 'code'" (click)="sortBy = 'code'"><i class="pi pi-sort-numeric-down"></i> Código</button>
        <button class="pill" [class.on]="sortBy === 'name'" (click)="sortBy = 'name'"><i class="pi pi-sort-alpha-down"></i> Nombre</button>
        <p-select [options]="catOptions()" optionLabel="name" optionValue="id" [(ngModel)]="catFilter" (onChange)="page.set(1)" placeholder="Todas las Categorías" [showClear]="true" styleClass="catf" appendTo="body" />
        <span class="sp"></span>
        <button class="op ghost" (click)="viewLimp()"><i class="pi pi-eye"></i> Ver AMENITIES - LIMPIEZA</button>
        <button class="op nuevo" (click)="openNew()"><i class="pi pi-plus"></i> Nuevo Artículo</button>
      </div>

      <div class="ops">
        <button class="op2 in" [disabled]="selected().size !== 1" (click)="openIngresar()"><i class="pi pi-plus"></i> Ingresar</button>
        <button class="op2 tr" [disabled]="selected().size === 0 || !limpId()" (click)="openTransfer()"><i class="pi pi-arrow-right-arrow-left"></i> Transferir a Limpieza @if (selected().size) { <span class="cnt">{{ selected().size }}</span> }</button>
        <span class="sp"></span>
        <button class="op2 ghost" (click)="print()"><i class="pi pi-print"></i> Imprimir</button>
        <button class="op2 ghost" [class.on]="lowOnly" (click)="lowOnly = !lowOnly"><i class="pi pi-exclamation-triangle"></i> Bajo Stock</button>
      </div>

      @if (loading()) { <p class="muted">Cargando…</p> }
      @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th class="ck"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" title="Seleccionar todos" /></th>
              <th>CÓDIGO</th><th>ARTÍCULO</th><th>CATEGORÍA</th><th class="n">PRECIOS (S/)</th><th class="c">REUT.</th><th class="n">STOCK</th><th class="c">ACCIONES</th>
            </tr></thead>
            <tbody>
              @for (r of paged(); track r.id) {
                <tr [class.low]="below(r)">
                  <td class="ck"><input type="checkbox" [checked]="isSel(r.id)" (change)="toggleSel(r.id)" /></td>
                  <td class="code">{{ r.sku || '—' }}<br /><small class="muted">{{ r.status === 'active' ? 'Activo' : 'Inactivo' }}</small></td>
                  <td class="art"><span class="ico">@if (r.imageUrl) { <img [src]="r.imageUrl" alt="" /> } @else { <i class="pi pi-sparkles"></i> }</span> {{ r.name }}</td>
                  <td>{{ r.category?.name || 'Sin categoría' }}<br /><small class="muted">Amenity</small></td>
                  <td class="n">Venta S/{{ num(r.salePrice).toFixed(2) }}<br /><small class="muted">Compra S/{{ num(r.cost).toFixed(2) }}</small></td>
                  <td class="c">@if (r.reusable) { <span class="tag yes">Sí</span> } @else { <span class="tag no">No</span> }</td>
                  <td class="n stk" [class.zero]="r.stock === 0">{{ r.stock }}</td>
                  <td class="c acc">
                    <button class="ic" title="Ingresar" (click)="openIngresar(r.id)"><i class="pi pi-plus"></i></button>
                    <button class="ic" title="Transferir a Limpieza" [disabled]="!limpId()" (click)="openTransfer(r.id)"><i class="pi pi-arrow-right-arrow-left"></i></button>
                    <button class="ic" title="Editar" (click)="openEdit(r)"><i class="pi pi-pencil"></i></button>
                    <button class="ic del" title="Eliminar" (click)="remove(r)"><i class="pi pi-trash"></i></button>
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="empty">Sin amenities. Crea uno con "Nuevo Artículo".</td></tr> }
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

    <!-- Ingreso (aumenta stock en el ALMACEN AMENITIES) -->
    <p-dialog [(visible)]="movVisible" [modal]="true" header="Ingresar amenity al almacén" [style]="{ width: '26rem' }">
      <p class="muted">{{ movRow()?.name }} — stock actual: {{ movRow()?.stock }}</p>
      <div class="fld"><label>Cantidad a ingresar</label><p-inputNumber [(ngModel)]="qty" [min]="1" [showButtons]="true" buttonLayout="horizontal" styleClass="w" /></div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="movVisible = false" />
        <p-button label="Ingresar" icon="pi pi-check" [loading]="busy()" (onClick)="applyIngresar()" />
      </ng-template>
    </p-dialog>

    <!-- Transferencia entre AMENITIES <-> AMENITIES-LIMPIEZA -->
    <p-dialog [(visible)]="transferVisible" [modal]="true" header="Transferencia de Amenities" [style]="{ width: '40rem', maxWidth: '96vw' }">
      <div class="dir">
        <button class="dirbtn" [class.on]="dir === 'TO_LIMP'" (click)="dir = 'TO_LIMP'"><i class="pi pi-arrow-right"></i> ALMACEN AMENITIES → AMENITIES - LIMPIEZA</button>
        <button class="dirbtn" [class.on]="dir === 'TO_MAIN'" (click)="dir = 'TO_MAIN'"><i class="pi pi-arrow-left"></i> AMENITIES - LIMPIEZA → ALMACEN AMENITIES <small>(sobrante)</small></button>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Artículo</th><th class="n">{{ dir === 'TO_LIMP' ? 'Stock origen' : 'Stock Limpieza' }}</th><th class="n">Enviar</th></tr></thead>
          <tbody>
            @for (it of transferItems; track it.id) {
              <tr>
                <td>{{ it.name }}</td>
                <td class="n" [class.over]="(qtyMap[it.id] || 0) > srcStock(it)">{{ srcStock(it) }}</td>
                <td class="n"><p-inputNumber [(ngModel)]="qtyMap[it.id]" [min]="0" inputStyleClass="cellq" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (dir === 'TO_MAIN' && !limpStockReady()) { <p class="muted">Cargando stock de AMENITIES - LIMPIEZA…</p> }
      @if (anyOver()) { <p class="over-msg"><i class="pi pi-exclamation-triangle"></i> Hay ítems cuya cantidad supera el stock disponible en el origen.</p> }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="transferVisible = false" />
        <p-button label="Confirmar Transferencia" icon="pi pi-check" [loading]="busy()" [disabled]="!transferReady()" (onClick)="applyTransfer()" />
      </ng-template>
    </p-dialog>

    <!-- Vista SOLO LECTURA de AMENITIES - LIMPIEZA -->
    <p-dialog [(visible)]="limpVisible" [modal]="true" header="AMENITIES - LIMPIEZA (solo lectura)" [style]="{ width: '40rem', maxWidth: '96vw' }">
      <p class="muted">Este almacén se alimenta únicamente desde el ALMACEN AMENITIES. Vista informativa, no editable.</p>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Artículo</th><th class="n">Stock</th></tr></thead>
          <tbody>
            @for (s of limpStock()?.items ?? []; track s.productId) { <tr><td>{{ s.name }}</td><td class="n">{{ s.quantity }}</td></tr> }
            @empty { <tr><td colspan="2" class="empty">AMENITIES - LIMPIEZA está vacío.</td></tr> }
          </tbody>
        </table>
      </div>
    </p-dialog>

    <!-- Crear / Editar amenity (modelo del modal de ropa, sin tamaño) -->
    <p-dialog [(visible)]="formVisible" [modal]="true" [header]="form.id ? 'Editar Amenity' : 'Crear Amenity'" [style]="{ width: '46rem', maxWidth: '96vw' }">
      <p class="pf-sub">Registra un amenity del hotel. Los reutilizables (ej. batas de tela) tendrán retorno; los desechables no.</p>
      <div class="pf">
        <div class="grid2">
          <div class="fld"><label>Código *</label><input pInputText [(ngModel)]="form.sku" placeholder="Ej: AMN-001" /><small>Código único de este amenity.</small></div>
          <div class="fld"><label>Código de barras (opcional)</label>
            <div class="bc"><input pInputText [(ngModel)]="form.barcode" placeholder="EAN-13, EAN-8, UPC, etc." /><button class="bc-cam" type="button" title="Escanear"><i class="pi pi-camera"></i></button></div>
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
          <div class="fld"><label>Nombre *</label><input pInputText [(ngModel)]="form.name" placeholder="Ej: Jabón Hotelero 10 gr" /></div>
          <div class="fld"><label>Categoría *</label>
            <p-select [options]="catOptions()" optionLabel="name" optionValue="id" [(ngModel)]="form.categoryId" placeholder="Selecciona" styleClass="w" appendTo="body" />
            @if (catOptions().length === 0) { <small class="req">No hay categorías de Amenities. Créalas en Inventario › Configuración › Categorías (Tipo de ítem = Amenities).</small> }
          </div>
        </div>
        <div class="fld"><label>¿Es reutilizable?</label>
          <div class="chks">
            <label class="chk2" [class.sel]="form.reusable === true"><input type="radio" name="reu" [value]="true" [(ngModel)]="form.reusable" /> <span>Sí · tiene flujo de retorno (ej. bata de tela)</span></label>
            <label class="chk2" [class.sel]="form.reusable === false"><input type="radio" name="reu" [value]="false" [(ngModel)]="form.reusable" /> <span>No · es desechable</span></label>
          </div>
        </div>
        <div class="grid2">
          <div class="fld"><label>Precio de compra *</label><p-inputNumber [(ngModel)]="form.cost" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w" /></div>
          <div class="fld"><label>Precio de alquiler / venta *</label><p-inputNumber [(ngModel)]="form.salePrice" mode="decimal" [minFractionDigits]="2" [min]="0" styleClass="w" /></div>
        </div>
        @if (!form.id) {
          <div class="fld"><label>Cantidad inicial (opcional)</label><p-inputNumber [(ngModel)]="form.stock" [min]="0" [showButtons]="true" buttonLayout="horizontal" styleClass="w" /><small>Stock inicial que se coloca en el ALMACEN AMENITIES.</small></div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" icon="pi pi-times" [text]="true" (onClick)="formVisible = false" />
        <p-button label="Guardar amenity" icon="pi pi-save" [loading]="busy()" [disabled]="!formValid()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .ar { padding: 1.4rem; }
      h1 { margin: 0; font-size: 1.5rem; } .muted { color: #8aa0bd; } .empty { text-align: center; padding: 2rem; color: #8aa0bd; }
      .banner { background: #06281f; border: 1px solid #10b981; color: #6ee7b7; border-radius: 10px; padding: 0.6rem 0.9rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; margin: 0.7rem 0; }
      .bar, .ops { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin: 0.9rem 0; }
      .search { display: flex; align-items: center; gap: 0.5rem; background: #0e1626; border: 1px solid #26364f; border-radius: 10px; padding: 0.5rem 0.9rem; color: #8aa0bd; min-width: 220px; }
      .search input { background: transparent; border: 0; color: #e2e8f0; outline: none; }
      .pill { display: inline-flex; align-items: center; gap: 0.4rem; background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.45rem 0.8rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
      .pill.on { background: #10b981; color: #04130d; border-color: #10b981; }
      .sp { flex: 1; }
      .op { display: inline-flex; align-items: center; gap: 0.4rem; border: 0; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; color: #fff; }
      .op.nuevo { background: #10b981; color: #04130d; } .op.ghost { background: #13243a; border: 1px solid #274468; color: #cbd5e1; }
      .op2 { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid #274468; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; background: transparent; color: #cbd5e1; }
      .op2.in { background: #22c55e; color: #04130d; border: 0; } .op2.tr { background: #6366f1; color: #fff; border: 0; } .op2:disabled { opacity: 0.5; cursor: not-allowed; }
      .op2.ghost.on { background: #78350f; color: #fbbf24; }
      .cnt { background: #04130d; color: #34d399; border-radius: 999px; font-size: 0.7rem; font-weight: 800; padding: 0.05rem 0.4rem; margin-left: 0.2rem; }
      .tbl-wrap { overflow-x: auto; border: 1px solid #1c2c44; border-radius: 12px; }
      .tbl { width: 100%; border-collapse: collapse; }
      .tbl th, .tbl td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #16233a; text-align: left; font-size: 0.82rem; white-space: nowrap; vertical-align: middle; }
      .tbl th { color: #8aa0bd; font-weight: 600; font-size: 0.7rem; background: #101a2c; }
      .tbl .n { text-align: right; } .tbl .c { text-align: center; }
      .tbl tr.low { background: rgba(248,113,113,0.06); }
      .code { font-weight: 700; color: #cbd5e1; } .code small, .art small, td small { font-weight: 400; }
      .art { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; } .art .ico { background: #16233a; padding: 0.3rem; border-radius: 6px; color: #8aa0bd; display: inline-flex; width: 1.9rem; height: 1.9rem; align-items: center; justify-content: center; overflow: hidden; } .art .ico img { width: 100%; height: 100%; object-fit: cover; }
      .stk { color: #fbbf24; font-weight: 800; } .stk.zero { color: #f87171; }
      .tag { border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.72rem; font-weight: 700; } .tag.yes { background: #064e3b; color: #6ee7b7; } .tag.no { background: #1f2937; color: #9ca3af; }
      .acc .ic { background: transparent; border: 0; color: #8aa0bd; cursor: pointer; padding: 0.2rem 0.35rem; } .acc .ic:hover { color: #34d399; } .acc .ic.del:hover { color: #f87171; } .acc .ic:disabled { opacity: 0.35; cursor: not-allowed; }
      .fld { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; } .fld label { font-size: 0.8rem; color: #8aa0bd; } .fld input { width: 100%; }
      .fld small { color: #64748b; font-size: 0.72rem; } .fld small.req { color: #fbbf24; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
      .pf-sub { color: #8aa0bd; font-size: 0.85rem; margin: 0 0 0.3rem; }
      .bc { display: flex; gap: 0.4rem; } .bc-cam { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0 0.7rem; cursor: pointer; }
      .img-row { display: flex; align-items: center; gap: 0.8rem; } .img-thumb { width: 3.2rem; height: 3.2rem; border-radius: 8px; background: #0e1626; border: 1px solid #26364f; display: flex; align-items: center; justify-content: center; color: #64748b; overflow: hidden; } .img-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .img-btn { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.45rem 0.8rem; cursor: pointer; font-size: 0.8rem; } .img-name { color: #64748b; font-size: 0.8rem; }
      .chks { display: flex; gap: 0.6rem; flex-wrap: wrap; } .chk2 { display: flex; align-items: center; gap: 0.45rem; background: #0e1626; border: 1px solid #26364f; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.82rem; color: #cbd5e1; } .chk2.sel { border-color: #10b981; background: #06281f; }
      .dir { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.8rem; }
      .dirbtn { text-align: left; background: #0e1626; border: 1px solid #26364f; color: #cbd5e1; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.8rem; font-weight: 600; } .dirbtn.on { border-color: #6366f1; background: #1e1b4b; color: #c7d2fe; } .dirbtn small { color: #8aa0bd; font-weight: 400; }
      .tbl td.n.over { color: #f87171; font-weight: 800; }
      :host ::ng-deep .cellq { width: 4.6rem; text-align: center; }
      .over-msg { color: #f87171; font-size: 0.82rem; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
      .pager { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.8rem; color: #8aa0bd; font-size: 0.82rem; }
      .pg { background: #13243a; border: 1px solid #274468; color: #cbd5e1; border-radius: 8px; padding: 0.35rem 0.6rem; cursor: pointer; } .pg:disabled { opacity: 0.4; cursor: not-allowed; } .pg-cur { font-weight: 700; color: #e2e8f0; }
      .pg-size { background: #0e1626; border: 1px solid #26364f; border-radius: 8px; color: #e2e8f0; padding: 0.3rem; }
      :host ::ng-deep .w { width: 100%; } :host ::ng-deep .catf { min-width: 200px; }
    `,
  ],
})
export class AlmacenAmenitiesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly inventory = inject(InventoryApiService);
  private readonly api = environment.apiUrl;

  readonly rows = signal<Product[]>([]);
  readonly cats = signal<Cat[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  readonly mainId = signal<string | null>(null);
  readonly limpId = signal<string | null>(null);
  readonly limpStock = signal<WarehouseStock | null>(null);

  search = '';
  sortBy: 'code' | 'name' = 'code';
  catFilter: string | null = null;
  lowOnly = false;

  readonly catOptions = computed(() => this.cats());

  // Ingreso
  movVisible = false;
  movItemId: string | null = null;
  qty: number | null = 1;

  // Transferencia
  transferVisible = false;
  dir: 'TO_LIMP' | 'TO_MAIN' = 'TO_LIMP';
  transferItems: Product[] = [];
  qtyMap: Record<string, number | null> = {};

  // Vista limpieza
  limpVisible = false;

  formVisible = false;
  form = this.emptyForm();
  private emptyForm() {
    return { id: undefined as string | undefined, sku: '', barcode: '', imageUrl: '', name: '', categoryId: null as string | null, reusable: false, cost: 0, salePrice: 0, stock: 0 };
  }

  num(v: string | number | null | undefined): number { return v == null ? 0 : Number(v); }
  below(p: Product): boolean { return (p.reorderPoint ?? 0) > 0 && p.stock <= (p.reorderPoint ?? 0); }
  formValid(): boolean { return !!this.form.sku?.trim() && !!this.form.name?.trim() && !!this.form.categoryId; }

  ngOnInit(): void {
    this.inventory.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((r) => {
      const ws = (r.data ?? []) as Warehouse[];
      const amen = ws.filter((w) => w.type === 'AMENITIES');
      this.limpId.set(amen.find((w) => w.name.toUpperCase() === LIMP_NAME)?.id ?? null);
      this.mainId.set(amen.find((w) => w.name.toUpperCase() !== LIMP_NAME)?.id ?? null);
    });
    this.http.get<ApiResponse<Cat[]>>(`${this.api}/inventory-categories`, { params: { pageSize: '200', sortBy: 'name' } })
      .subscribe((r) => this.cats.set((r.data ?? []).filter((c) => c.type === 'AMENITY' && c.status === 'active')));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.inventory.products.list({ area: 'AMENITIES', pageSize: 300 }).subscribe({
      next: (r) => {
        const catIds = new Set(this.cats().map((c) => c.id));
        // Amenities = productos cuya categoría es de tipo Amenities. Si aún no hay
        // categorías cargadas, filtramos en el siguiente ciclo; reintentamos si hace falta.
        const all = (r.data ?? []) as Product[];
        const apply = () => {
          const ids = new Set(this.cats().map((c) => c.id));
          this.rows.set(all.filter((p) => p.categoryId && ids.has(p.categoryId)));
          this.loading.set(false);
        };
        if (catIds.size === 0) queueMicrotask(apply); else apply();
      },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el almacén de amenities.' }); },
    });
  }

  // Selección
  isSel(id: string): boolean { return this.selected().has(id); }
  toggleSel(id: string): void { const s = new Set(this.selected()); s.has(id) ? s.delete(id) : s.add(id); this.selected.set(s); }
  allSelected(): boolean { const f = this.filtered(); return f.length > 0 && f.every((r) => this.selected().has(r.id)); }
  toggleAll(): void { const f = this.filtered(); this.selected.set(this.allSelected() ? new Set() : new Set(f.map((r) => r.id))); }

  filtered(): Product[] {
    const q = this.search.trim().toLowerCase();
    return this.rows()
      .filter((r) => !this.catFilter || r.categoryId === this.catFilter)
      .filter((r) => !this.lowOnly || this.below(r))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.sku ?? '').toLowerCase().includes(q))
      .sort((a, b) => (this.sortBy === 'name' ? a.name.localeCompare(b.name) : (a.sku ?? '').localeCompare(b.sku ?? '')));
  }

  readonly page = signal(1);
  pageSize = 10;
  totalPages(): number { return Math.max(1, Math.ceil(this.filtered().length / this.pageSize)); }
  paged(): Product[] {
    const p = Math.min(this.page(), this.totalPages());
    if (p !== this.page()) queueMicrotask(() => this.page.set(p));
    const start = (p - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  }
  pageStart(): number { return this.filtered().length === 0 ? 0 : (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize + 1; }
  pageEnd(): number { return Math.min(this.filtered().length, Math.min(this.page(), this.totalPages()) * this.pageSize); }

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

  // CRUD
  openNew(): void { this.form = this.emptyForm(); this.formVisible = true; }
  openEdit(p: Product): void {
    this.form = { id: p.id, sku: p.sku ?? '', barcode: p.barcode ?? '', imageUrl: p.imageUrl ?? '', name: p.name, categoryId: p.categoryId ?? null, reusable: !!p.reusable, cost: this.num(p.cost), salePrice: this.num(p.salePrice), stock: p.stock };
    this.formVisible = true;
  }
  save(): void {
    if (!this.formValid()) { this.toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa Código, Nombre y Categoría.' }); return; }
    this.busy.set(true);
    const dto = {
      name: this.form.name.trim(), sku: this.form.sku || undefined, barcode: this.form.barcode || undefined,
      imageUrl: this.form.imageUrl || undefined, reusable: this.form.reusable, categoryId: this.form.categoryId,
      productType: 'AMENITY', unit: 'NIU', igvType: 'GRAVADO', igvPercent: 18, taxable: true,
      salePrice: this.form.salePrice, cost: this.form.cost ?? 0, reorderPoint: 0, receptionReorderPoint: 0,
      status: 'active' as const,
      stock: this.form.id ? undefined : (this.form.stock || 0),
      initialWarehouseId: this.form.id ? undefined : (this.mainId() ?? undefined),
    };
    const req$ = this.form.id ? this.inventory.products.update(this.form.id, dto) : this.inventory.products.create(dto);
    req$.subscribe({
      next: () => { this.busy.set(false); this.formVisible = false; this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Amenity guardado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }); },
    });
  }
  remove(p: Product): void {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    this.inventory.products.remove(p.id).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Eliminado', detail: '' }); this.reload(); },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo eliminar.' }),
    });
  }

  // Ingreso al ALMACEN AMENITIES
  movRow(): Product | undefined { return this.rows().find((r) => r.id === this.movItemId); }
  openIngresar(id?: string): void {
    const target = id ?? [...this.selected()][0];
    if (!target) return;
    this.movItemId = target; this.qty = 1; this.movVisible = true;
  }
  applyIngresar(): void {
    const id = this.movItemId; const wh = this.mainId();
    if (!id || !wh || !this.qty || this.qty <= 0) return;
    this.busy.set(true);
    this.inventory.adjust({ productId: id, warehouseId: wh, quantity: this.qty, reference: 'Ingreso amenity' }).subscribe({
      next: () => { this.busy.set(false); this.movVisible = false; this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Amenity ingresado.' }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo ingresar.' }); },
    });
  }

  // Transferencia AMENITIES <-> AMENITIES-LIMPIEZA
  openTransfer(id?: string): void {
    const ids = id ? [id] : [...this.selected()];
    if (!ids.length) return;
    const byId = new Map(this.rows().map((r) => [r.id, r]));
    this.transferItems = ids.map((i) => byId.get(i)).filter((r): r is Product => !!r);
    this.qtyMap = {};
    for (const it of this.transferItems) this.qtyMap[it.id] = null;
    this.dir = 'TO_LIMP';
    this.transferVisible = true;
    this.loadLimpStock();
  }
  loadLimpStock(): void {
    const wh = this.limpId();
    if (!wh) return;
    this.inventory.warehouseStock(wh).subscribe((r) => this.limpStock.set(r.data ?? null));
  }
  limpStockReady(): boolean { return this.limpStock() !== null; }
  srcStock(it: Product): number {
    if (this.dir === 'TO_LIMP') return it.stock;
    return this.limpStock()?.items?.find((s) => s.productId === it.id)?.quantity ?? 0;
  }
  anyOver(): boolean { return this.transferItems.some((it) => (Number(this.qtyMap[it.id]) || 0) > this.srcStock(it)); }
  transferReady(): boolean {
    if (this.anyOver()) return false;
    if (this.dir === 'TO_MAIN' && !this.limpStockReady()) return false;
    return this.transferItems.some((it) => (Number(this.qtyMap[it.id]) || 0) > 0);
  }
  applyTransfer(): void {
    if (!this.transferReady()) return;
    const from = this.dir === 'TO_LIMP' ? this.mainId() : this.limpId();
    const to = this.dir === 'TO_LIMP' ? this.limpId() : this.mainId();
    if (!from || !to) return;
    const calls = this.transferItems
      .map((it) => ({ it, q: Number(this.qtyMap[it.id]) || 0 }))
      .filter((x) => x.q > 0)
      .map((x) => this.inventory.transfer({ productId: x.it.id, fromWarehouseId: from, toWarehouseId: to, quantity: x.q, reference: this.dir === 'TO_LIMP' ? 'Amenities → Limpieza' : 'Sobrante Limpieza → Amenities' }));
    if (!calls.length) return;
    this.busy.set(true);
    forkJoin(calls).subscribe({
      next: () => { this.busy.set(false); this.transferVisible = false; this.selected.set(new Set()); this.toast.add({ severity: 'success', summary: 'Transferencia', detail: `${calls.length} envío(s) realizados.` }); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo transferir.' }); },
    });
  }

  viewLimp(): void { this.limpVisible = true; this.loadLimpStock(); }

  print(): void {
    const body = `<table><thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th class="num">Venta</th><th class="num">Compra</th><th class="num">Stock</th></tr></thead><tbody>${
      this.filtered().map((r) => `<tr><td>${r.sku ?? ''}</td><td>${r.name}</td><td>${r.category?.name ?? ''}</td><td class="num">${this.num(r.salePrice).toFixed(2)}</td><td class="num">${this.num(r.cost).toFixed(2)}</td><td class="num">${r.stock}</td></tr>`).join('')
    }</tbody></table>`;
    printPdf('Almacén de Amenities', body);
  }
}
