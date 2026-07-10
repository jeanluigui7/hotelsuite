import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogApiService } from '../catalogs/catalog-api.service';
import type { RoomType, InventoryCategory } from '../catalogs/catalog.models';

interface Dotacion {
  id: string;
  roomTypeId: string;
  category?: string | null;
  articleKind: string;
  name: string;
  size?: string | null;
  baseQty: number;
  status: string;
}
interface FloorItem { linenItemId: string; name: string; type: string; color?: string | null; available: number; enviar: number; }
interface PrimeraData {
  room: { id: string; number: string; floor?: string | null; tower?: string | null; roomType?: { name: string }; linenFloor: string | null };
  items: { linenItemId: string; name: string; type: string; quantity: number }[];
  floorAvailable: { linenItemId: string; name: string; type: string; color?: string | null; available: number }[];
}
interface PlanGroup { category: string; required: number; items: FloorItem[]; }

/** Tipo de ítem de la categoría → clase de artículo de la dotación. */
const TYPE_TO_KIND: Record<string, string> = { CLOTHING: 'LINEN_REUSABLE', AMENITY: 'AMENITY', PRODUCT: 'SALE', CLEANING_SUPPLY: 'ASSET' };
/** Clase de artículo → grupo visible en la dotación. */
function kindGroup(kind: string): 'CLOTHING' | 'AMENITIES' | 'OTROS' {
  if (kind === 'LINEN_REUSABLE') return 'CLOTHING';
  if (kind === 'AMENITY') return 'AMENITIES';
  return 'OTROS';
}
const GROUP_META: Record<string, { label: string; cls: string }> = {
  CLOTHING: { label: 'Ropa', cls: 'g-ropa' },
  AMENITIES: { label: 'Amenities', cls: 'g-amen' },
  OTROS: { label: 'Otros', cls: 'g-otros' },
};

@Component({
  selector: 'app-dotacion',
  standalone: true,
  imports: [FormsModule, InputTextModule, InputNumberModule, DialogModule, SelectModule, ButtonModule],
  template: `
    <section class="dt">
      <header class="top">
        <div><h1>Items BASE de Limpieza</h1><p class="muted">Configura cuáles ítems de cada categoría se reponen al limpiar cada tipo de habitación. Las categorías salen de Inventario › Configuración › Categorías.</p></div>
        @if (canEdit) { <button class="primera" (click)="openPrimera()"><i class="pi pi-inbox"></i> Primera Dotación</button> }
      </header>

      <div class="layout">
        <!-- Izquierda: tipos de habitación -->
        <aside class="rt-list">
          <h3>Tipos de Habitación</h3>
          @for (rt of roomTypes(); track rt.id) {
            <button class="rt-card" [class.on]="rt.id === roomTypeId" (click)="selectType(rt.id)">
              <strong>{{ rt.name }}</strong><small>Capacidad {{ rt.capacity }}</small>
            </button>
          } @empty { <p class="muted">No hay tipos de habitación.</p> }
        </aside>

        <!-- Derecha -->
        <div class="panel">
          @if (!roomTypeId) {
            <p class="muted empty">Selecciona un tipo de habitación para configurar su dotación base.</p>
          } @else {
            <div class="rt-head">
              <h2>{{ selectedTypeName() }}</h2>
              <span class="summary">{{ summary() }}</span>
            </div>

            <!-- Seleccionar categoría para agregar -->
            <div class="box">
              <h4><i class="pi pi-plus-circle"></i> Seleccionar categoría para agregar</h4>
              <p class="muted">Haz clic en una categoría para agregarla a la configuración de {{ selectedTypeName() }}.</p>
              @for (g of chipGroups(); track g.key) {
                <div class="cg">
                  <div class="cg-title" [class]="g.cls">{{ g.label }}</div>
                  <div class="chips">
                    @for (c of g.cats; track c.id) {
                      <button class="chip" (click)="addCategory(c)"><i class="pi pi-plus"></i> {{ c.name }}</button>
                    } @empty { <span class="muted sm">Sin categorías en este grupo.</span> }
                  </div>
                </div>
              }
            </div>

            <!-- Categorías configuradas -->
            <div class="box">
              <h4>Categorías configuradas</h4>
              <p class="muted">Estas categorías y cantidades se repondrán al limpiar una habitación {{ selectedTypeName() }}.</p>
              @for (g of configuredGroups(); track g.key) {
                <div class="cg">
                  <div class="cg-title" [class]="g.cls">{{ g.label }} ({{ g.items.length }})</div>
                  @for (it of g.items; track it.id) {
                    <div class="row">
                      <span class="rn">{{ it.name }}</span>
                      @if (g.key === 'CLOTHING') {
                        <p-select class="size" [options]="sizesFor(it.name)" [(ngModel)]="it.size" (onChange)="saveField(it)" [placeholder]="sizesFor(it.name).length ? 'Tamaño' : 'Sin tamaños'" [showClear]="true" appendTo="body" styleClass="size-sel" />
                      }
                      <span class="q">Cant. <p-inputNumber [(ngModel)]="it.baseQty" [min]="1" [showButtons]="true" buttonLayout="horizontal" (onBlur)="saveField(it)" inputStyleClass="qi" /></span>
                      @if (canDelete) { <button class="del" (click)="removeItem(it)" title="Quitar"><i class="pi pi-trash"></i></button> }
                    </div>
                  }
                </div>
              }
              @if (items().length === 0) { <p class="muted empty">Sin categorías configuradas. Agrega desde el bloque de arriba.</p> }
            </div>
          }
        </div>
      </div>
    </section>

    <!-- PRIMERA DOTACIÓN: gerencia asigna la ropa real a una habitación según la regla del tipo -->
    <p-dialog [(visible)]="primeraVisible" [modal]="true" header="Primera Dotación de Habitación" [style]="{ width: '52rem', maxWidth: '96vw' }" styleClass="dk-dialog">
      <p class="pd-sub">Elige la habitación. Se aplica la regla de <b>Dotación Base</b> de su tipo y se toman las prendas del piso que la abastece (descuenta del piso).</p>
      <div class="pd-bar">
        <p-select [options]="rooms()" [(ngModel)]="primeraRoomId" (onChange)="loadPrimera()" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona una habitación" styleClass="w" appendTo="body">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType?.name }} · Piso {{ r.floor || '-' }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType?.name }}</ng-template>
        </p-select>
      </div>

      @if (primeraRoomId && primera(); as p) {
        <div class="pd-info">Piso de ropa: <b>{{ p.room.linenFloor || 'sin piso' }}</b> · Regla del tipo <b>{{ p.room.roomType?.name }}</b></div>
        @if (!p.room.linenFloor) { <p class="muted">La habitación no tiene un piso/subalmacén asignado (configúralo en Inventario › Áreas).</p> }
        @else if (planGroups().length === 0) { <p class="muted">El tipo de habitación no tiene ropa en su Dotación Base, o no hay ropa disponible en el piso.</p> }
        @else {
          @for (g of planGroups(); track g.category) {
            <div class="pd-cat">
              <div class="pd-cat-h">{{ g.category }} <span class="pd-req" [class.ok]="assigned(g) >= g.required">asignadas {{ assigned(g) }} / requeridas {{ g.required }}</span></div>
              <table class="pd-tbl">
                <thead><tr><th>Prenda</th><th class="cn">Disp. piso</th><th class="cn">Dotar</th></tr></thead>
                <tbody>
                  @for (f of g.items; track f.linenItemId) {
                    <tr>
                      <td class="nm"><span class="dot" [style.background]="f.color || '#888'"></span>{{ f.name }}</td>
                      <td class="cn" [class.zero]="f.available === 0">{{ f.available }}</td>
                      <td class="cn"><p-inputNumber [(ngModel)]="f.enviar" [min]="0" [max]="f.available" inputStyleClass="qi" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @if (primeraOver()) { <p class="pd-over"><i class="pi pi-exclamation-triangle"></i> Alguna cantidad supera el disponible del piso.</p> }
        }
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="primeraVisible = false" />
        <p-button label="Dotar habitación" icon="pi pi-check" [loading]="primeraBusy()" [disabled]="!primeraReady()" (onClick)="confirmPrimera()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .dt { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      h1 { margin: 0; color: #fff; font-size: 1.5rem; } .muted { color: #8b97a8; } .muted.sm { font-size: 0.8rem; } .empty { padding: 1.5rem 0; }
      .layout { display: grid; grid-template-columns: 260px 1fr; gap: 1.2rem; margin-top: 1.1rem; }
      .rt-list { display: flex; flex-direction: column; gap: 0.5rem; } .rt-list h3 { margin: 0 0 0.4rem; color: #9fb0c3; font-size: 0.9rem; }
      .rt-card { text-align: left; background: #0e1622; border: 1px solid #1f2a3a; border-radius: 10px; padding: 0.8rem 1rem; cursor: pointer; color: #e6e9ef; display: flex; flex-direction: column; gap: 0.15rem; }
      .rt-card strong { font-size: 0.95rem; } .rt-card small { color: #8b97a8; font-size: 0.76rem; }
      .rt-card.on { background: #10b981; border-color: #10b981; color: #04130d; } .rt-card.on small { color: #043d2b; }
      .panel { min-width: 0; }
      .rt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .rt-head h2 { margin: 0; color: #fff; font-size: 1.2rem; } .summary { color: #8b97a8; font-size: 0.85rem; }
      .box { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: 1.1rem; }
      .box h4 { margin: 0 0 0.3rem; color: #fff; font-size: 0.98rem; display: flex; align-items: center; gap: 0.45rem; }
      .box > .muted { margin: 0 0 0.8rem; font-size: 0.82rem; }
      .cg { margin-bottom: 0.9rem; }
      .cg-title { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 0.5rem; display: inline-flex; align-items: center; gap: 0.4rem; }
      .cg-title.g-ropa { color: #f9a8d4; } .cg-title.g-amen { color: #6ee7b7; } .cg-title.g-otros { color: #93a3b8; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .chip { display: inline-flex; align-items: center; gap: 0.4rem; background: #131f30; border: 1px solid #26364f; color: #cdd8e6; border-radius: 8px; padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.84rem; }
      .chip:hover { border-color: #10b981; color: #fff; } .chip i { color: #34d399; font-size: 0.75rem; }
      .row { display: flex; align-items: center; gap: 0.8rem; background: #0b1220; border: 1px solid #1c2c44; border-radius: 10px; padding: 0.55rem 0.85rem; margin-bottom: 0.45rem; }
      .row .rn { flex: 1; font-weight: 600; } .row .size { width: 12rem; }
      .row .q { display: inline-flex; align-items: center; gap: 0.4rem; color: #8b97a8; font-size: 0.82rem; }
      :host ::ng-deep .qi { width: 4rem; text-align: center; }
      .del { background: transparent; border: 0; color: #f87171; cursor: pointer; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .primera { background: #10b981; color: #04130d; border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; white-space: nowrap; } .primera:hover { background: #34d399; }
      .pd-sub { color: #8b97a8; font-size: 0.86rem; margin: 0 0 0.6rem; }
      .pd-bar { margin-bottom: 0.8rem; } :host ::ng-deep .w { width: 100%; }
      .pd-info { background: #101a2c; border: 1px solid #24344a; border-radius: 8px; padding: 0.5rem 0.8rem; font-size: 0.84rem; color: #cdd8e6; margin-bottom: 0.7rem; }
      .pd-cat { border: 1px solid #1f2a3a; border-radius: 10px; margin-bottom: 0.7rem; overflow: hidden; }
      .pd-cat-h { background: #101a2c; padding: 0.5rem 0.8rem; font-weight: 700; color: #cdd8e6; display: flex; justify-content: space-between; align-items: center; }
      .pd-req { font-size: 0.74rem; font-weight: 700; color: #fbbf24; background: #2a2410; border-radius: 999px; padding: 0.12rem 0.55rem; } .pd-req.ok { color: #6ee7b7; background: #06281f; }
      .pd-tbl { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
      .pd-tbl th { text-align: left; padding: 0.4rem 0.8rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1c2c44; font-size: 0.72rem; }
      .pd-tbl td { padding: 0.4rem 0.8rem; border-bottom: 1px solid #16202e; } .pd-tbl tr:last-child td { border-bottom: 0; }
      .pd-tbl th.cn, .pd-tbl td.cn { text-align: center; } .pd-tbl td.cn.zero { color: #f87171; }
      .pd-tbl .nm { font-weight: 600; color: #fff; display: flex; align-items: center; gap: 0.45rem; }
      .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); }
      .pd-over { color: #f87171; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; }
      :host ::ng-deep .dk-dialog .p-dialog-content, :host ::ng-deep .dk-dialog .p-dialog-header, :host ::ng-deep .dk-dialog .p-dialog-footer { background: #0e1622; color: #e6e9ef; }
      @media (max-width: 820px) { .layout { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DotacionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly catalog = inject(CatalogApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly roomTypes = signal<RoomType[]>([]);
  readonly categories = signal<InventoryCategory[]>([]);
  readonly items = signal<Dotacion[]>([]);
  roomTypeId: string | null = null;

  readonly canEdit = this.auth.can('settings', 'edit') || this.auth.can('settings', 'create');
  readonly canDelete = this.auth.can('settings', 'delete');

  // ── Primera Dotación (gerencia asigna ropa real a una habitación) ──
  readonly rooms = signal<{ id: string; number: string; floor?: string | null; roomType?: { name: string } }[]>([]);
  readonly primera = signal<PrimeraData | null>(null);
  readonly planGroups = signal<PlanGroup[]>([]);
  readonly primeraBusy = signal(false);
  primeraVisible = false;
  primeraRoomId: string | null = null;

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => {
      this.roomTypes.set(res.data ?? []);
      if (!this.roomTypeId && res.data?.length) this.selectType(res.data[0].id);
    });
    this.catalog.inventoryCategories.list({ pageSize: 300, sortBy: 'name' }).subscribe((r) => this.categories.set((r.data ?? []).filter((c) => c.status === 'active')));
    this.http.get<ApiResponse<{ id: string; number: string; floor?: string | null; roomType?: { name: string } }[]>>(`${this.api}/rooms`, { params: { pageSize: '300', sortBy: 'number' } })
      .subscribe((r) => this.rooms.set(r.data ?? []));
  }

  openPrimera(): void { this.primeraVisible = true; this.primeraRoomId = null; this.primera.set(null); this.planGroups.set([]); }

  /** Carga la ropa disponible del piso + la regla del tipo, y arma el plan auto-rellenado. */
  loadPrimera(): void {
    const id = this.primeraRoomId;
    if (!id) { this.primera.set(null); this.planGroups.set([]); return; }
    this.primera.set(null); this.planGroups.set([]);
    this.http.get<ApiResponse<PrimeraData>>(`${this.api}/rooms/${id}/linen`).subscribe((lin) => {
      const data = lin.data ?? null;
      this.primera.set(data);
      // Regla del tipo: cantidades base por categoría de ROPA (Dotación Base).
      this.http.get<ApiResponse<{ name: string; articleKind: string; baseQty: number; source: string }[]>>(`${this.api}/rooms/${id}/inventory`).subscribe((invr) => {
        const req = new Map<string, number>();
        for (const row of invr.data ?? []) {
          if (row.source === 'dotacion' && row.articleKind === 'LINEN_REUSABLE' && row.baseQty > 0) req.set(row.name.toUpperCase(), row.baseQty);
        }
        const avail = data?.floorAvailable ?? [];
        const groups: PlanGroup[] = [];
        for (const [catUpper, required] of req) {
          const items = avail.filter((f) => (f.type || '').toUpperCase() === catUpper).map((f) => ({ ...f, enviar: 0 as number }));
          if (!items.length) { groups.push({ category: this.prettyCat(avail, catUpper), required, items }); continue; }
          // Auto-rellena para cumplir la cantidad requerida (greedy por disponible).
          let left = required;
          for (const it of items) { const take = Math.min(left, it.available); it.enviar = take; left -= take; if (left <= 0) break; }
          groups.push({ category: items[0]?.type ?? this.prettyCat(avail, catUpper), required, items });
        }
        this.planGroups.set(groups);
      });
    });
  }
  private prettyCat(avail: { type: string }[], up: string): string { return avail.find((a) => (a.type || '').toUpperCase() === up)?.type ?? up; }
  assigned(g: PlanGroup): number { return g.items.reduce((a, f) => a + (Number(f.enviar) || 0), 0); }
  primeraOver(): boolean { return this.planGroups().some((g) => g.items.some((f) => (Number(f.enviar) || 0) > f.available)); }
  primeraReady(): boolean { return !this.primeraOver() && this.planGroups().some((g) => this.assigned(g) > 0); }
  confirmPrimera(): void {
    const id = this.primeraRoomId;
    if (!id || !this.primeraReady()) return;
    const items = this.planGroups().flatMap((g) => g.items).filter((f) => (Number(f.enviar) || 0) > 0).map((f) => ({ linenItemId: f.linenItemId, quantity: Number(f.enviar) || 0 }));
    this.primeraBusy.set(true);
    this.http.post<ApiResponse<{ items: number }>>(`${this.api}/rooms/${id}/dote-linen`, { items }).subscribe({
      next: () => { this.primeraBusy.set(false); this.primeraVisible = false; this.messages.add({ severity: 'success', summary: 'Habitación dotada', detail: `${items.length} prenda(s) asignadas y descontadas del piso.` }); },
      error: (e: HttpErrorResponse) => { this.primeraBusy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo dotar.' }); },
    });
  }

  selectedTypeName(): string { return this.roomTypes().find((t) => t.id === this.roomTypeId)?.name ?? ''; }

  /** Tamaños de una categoría de Ropa (por nombre), definidos en Inventario › Configuración › Categorías. */
  sizesFor(name: string): string[] {
    const c = this.categories().find((x) => x.name.toUpperCase() === (name || '').toUpperCase());
    return c?.sizes ?? [];
  }

  /** Chips agrupados: Ropa / Amenities / Sin clasificar. */
  readonly chipGroups = computed(() => {
    const cats = this.categories();
    return [
      { key: 'CLOTHING', label: 'Ropa', cls: 'g-ropa', cats: cats.filter((c) => c.type === 'CLOTHING') },
      { key: 'AMENITIES', label: 'Amenities', cls: 'g-amen', cats: cats.filter((c) => c.type === 'AMENITY') },
      { key: 'OTROS', label: 'Sin clasificar', cls: 'g-otros', cats: cats.filter((c) => c.type !== 'CLOTHING' && c.type !== 'AMENITY') },
    ];
  });

  /** Ítems configurados agrupados por Ropa / Amenities / Otros. */
  configuredGroups(): { key: string; label: string; cls: string; items: Dotacion[] }[] {
    const groups: Record<string, Dotacion[]> = { CLOTHING: [], AMENITIES: [], OTROS: [] };
    for (const it of this.items()) groups[kindGroup(it.articleKind)].push(it);
    return (['CLOTHING', 'AMENITIES', 'OTROS'] as const)
      .filter((k) => groups[k].length)
      .map((k) => ({ key: k, label: GROUP_META[k].label, cls: GROUP_META[k].cls, items: groups[k] }));
  }

  summary(): string {
    const ropa = this.items().filter((i) => kindGroup(i.articleKind) === 'CLOTHING').length;
    const amen = this.items().filter((i) => kindGroup(i.articleKind) === 'AMENITIES').length;
    const otros = this.items().filter((i) => kindGroup(i.articleKind) === 'OTROS').length;
    const parts = [ropa ? `${ropa} ropa` : '', amen ? `${amen} amenities` : '', otros ? `${otros} otros` : ''].filter(Boolean);
    return `${parts.join(' + ') || '0'} = ${this.items().length} ítems BASE`;
  }

  selectType(id: string): void { this.roomTypeId = id; this.reload(); }

  reload(): void {
    if (!this.roomTypeId) { this.items.set([]); return; }
    this.http.get<ApiResponse<Dotacion[]>>(`${this.api}/dotacion`, { params: { roomTypeId: this.roomTypeId } })
      .subscribe({ next: (r) => this.items.set(r.data ?? []), error: () => this.items.set([]) });
  }

  /** Agrega una categoría a la dotación del tipo de habitación seleccionado. */
  addCategory(c: InventoryCategory): void {
    if (!this.roomTypeId || !this.canEdit) return;
    const articleKind = TYPE_TO_KIND[c.type ?? ''] ?? 'ASSET';
    this.http.post<ApiResponse<Dotacion>>(`${this.api}/dotacion`, {
      roomTypeId: this.roomTypeId, category: c.name, articleKind, name: c.name, size: '', baseQty: 1, status: 'active',
    }).subscribe({
      next: () => this.reload(),
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo agregar.' }),
    });
  }

  /** Guarda cantidad/tamaño de un ítem (al salir del campo). */
  saveField(it: Dotacion): void {
    if (!this.canEdit) return;
    this.http.put<ApiResponse<Dotacion>>(`${this.api}/dotacion/${it.id}`, { baseQty: it.baseQty, size: it.size || '' })
      .subscribe({ error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo guardar.' }) });
  }

  removeItem(it: Dotacion): void {
    this.http.delete<ApiResponse<unknown>>(`${this.api}/dotacion/${it.id}`).subscribe({
      next: () => this.reload(),
      error: (e: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo quitar.' }),
    });
  }
}
