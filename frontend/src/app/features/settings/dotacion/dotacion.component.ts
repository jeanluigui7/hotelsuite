import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
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

/** Tipo de categoría (Área) → clase de artículo de la dotación. */
const TYPE_TO_KIND: Record<string, string> = { CLOTHING: 'LINEN_REUSABLE', AMENITIES: 'AMENITY', PRODUCTS: 'SALE', CLEANING: 'ASSET' };
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
  imports: [FormsModule, InputTextModule, InputNumberModule],
  template: `
    <section class="dt">
      <header class="top">
        <div><h1>Items BASE de Limpieza</h1><p class="muted">Configura cuáles ítems de cada categoría se reponen al limpiar cada tipo de habitación. Las categorías salen de Inventario › Configuración › Categorías.</p></div>
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
                        <input class="size" pInputText [(ngModel)]="it.size" (blur)="saveField(it)" placeholder="Tamaño (ej. King, 2 plazas)" />
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

  ngOnInit(): void {
    this.catalog.roomTypes.list({ pageSize: 100, sortBy: 'name' }).subscribe((res) => {
      this.roomTypes.set(res.data ?? []);
      if (!this.roomTypeId && res.data?.length) this.selectType(res.data[0].id);
    });
    this.catalog.inventoryCategories.list({ pageSize: 300, sortBy: 'name' }).subscribe((r) => this.categories.set((r.data ?? []).filter((c) => c.status === 'active')));
  }

  selectedTypeName(): string { return this.roomTypes().find((t) => t.id === this.roomTypeId)?.name ?? ''; }

  /** Chips agrupados: Ropa / Amenities / Sin clasificar. */
  readonly chipGroups = computed(() => {
    const cats = this.categories();
    return [
      { key: 'CLOTHING', label: 'Ropa', cls: 'g-ropa', cats: cats.filter((c) => c.type === 'CLOTHING') },
      { key: 'AMENITIES', label: 'Amenities', cls: 'g-amen', cats: cats.filter((c) => c.type === 'AMENITIES') },
      { key: 'OTROS', label: 'Sin clasificar', cls: 'g-otros', cats: cats.filter((c) => c.type !== 'CLOTHING' && c.type !== 'AMENITIES') },
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
