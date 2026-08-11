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
interface FloorItem { linenItemId: string; name: string; type: string; size?: string | null; color?: string | null; available: number; enviar: number; }
interface AmenVariant { productId: string; name: string; reusable: boolean; category?: string | null; available: number; enviar: number; }
interface PrimeraData {
  room: { id: string; number: string; floor?: string | null; tower?: string | null; roomType?: { name: string }; linenFloor: string | null; amenitiesWarehouse?: string | null };
  items: { linenItemId: string; name: string; type: string; quantity: number }[];
  floorAvailable: { linenItemId: string; name: string; type: string; size?: string | null; color?: string | null; available: number }[];
  amenitiesAvailable?: { productId: string; name: string; reusable: boolean; category?: string | null; available: number }[];
}
interface PlanGroup { category: string; size: string | null; required: number; items: FloorItem[]; }
interface AmenGroup { category: string; required: number; items: AmenVariant[]; }

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
        @if (canEdit) {
          <div class="hdr-actions">
            <button class="primera" (click)="openPrimera()"><i class="pi pi-inbox"></i> Primera Dotación</button>
            <button class="setear" (click)="openSetear()"><i class="pi pi-eraser"></i> Setear Habitación</button>
          </div>
        }
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
        <!-- ROPA -->
        <div class="pd-sect">Ropa @if (p.room.linenFloor) { · piso {{ p.room.linenFloor }} }</div>
        @if (!p.room.linenFloor) { <p class="muted">La habitación no tiene un piso/subalmacén asignado; no se puede dotar ropa (configúralo en Inventario › Áreas).</p> }
        @else if (planGroups().length === 0) { <p class="muted">El tipo <b>{{ p.room.roomType?.name }}</b> no tiene regla de ropa en la Dotación Base.</p> }
        @else {
          @for (g of planGroups(); track g.category) {
            <div class="pd-cat">
              <div class="pd-cat-h">{{ g.category }} @if (g.size) { <span class="pd-size">Tamaño: {{ g.size }}</span> } <span class="pd-req" [class.ok]="assigned(g) === g.required" [class.bad]="assigned(g) > g.required">asignadas {{ assigned(g) }} / requeridas {{ g.required }}</span></div>
              <table class="pd-tbl">
                <thead><tr><th>Prenda</th><th class="cn">Tamaño</th><th class="cn">Disp. piso</th><th class="cn">Dotar</th></tr></thead>
                <tbody>
                  @for (f of g.items; track f.linenItemId) {
                    <tr>
                      <td class="nm"><span class="dot" [style.background]="f.color || '#888'"></span>{{ f.name }}</td>
                      <td class="cn muted">{{ f.size || '—' }}</td>
                      <td class="cn" [class.zero]="f.available === 0">{{ f.available }}</td>
                      <td class="cn"><p-inputNumber [(ngModel)]="f.enviar" [min]="0" [max]="f.available" inputStyleClass="qi" /></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="cn muted" style="padding:.6rem;">@if (g.size) { No hay prendas de tamaño <b>{{ g.size }}</b> con stock en el piso. Transfiérelas o ajusta el tamaño en la Dotación Base. } @else { Sin prendas de esta categoría con stock en el piso. }</td></tr>
                  }
                </tbody>
              </table>
              @if (g.items.length > 0 && assigned(g) < g.required) { <p class="pd-short"><i class="pi pi-exclamation-triangle"></i> Faltan {{ g.required - assigned(g) }} de <b>{{ g.category }}</b>@if (g.size) { tamaño {{ g.size }} } en el piso. No se puede dotar hasta cubrir la regla.</p> }
              @if (assigned(g) > g.required) { <p class="pd-short"><i class="pi pi-exclamation-triangle"></i> La regla pide {{ g.required }}; reduce la cantidad.</p> }
            </div>
          }
        }

        <!-- AMENITIES -->
        <div class="pd-sect">Amenities · {{ p.room.amenitiesWarehouse || 'AMENITIES - LIMPIEZA' }}</div>
        @if (amenGroups().length === 0) { <p class="muted">El tipo <b>{{ p.room.roomType?.name }}</b> no tiene regla de amenities en la Dotación Base.</p> }
        @else {
          @for (g of amenGroups(); track g.category) {
            <div class="pd-cat">
              <div class="pd-cat-h">{{ g.category }} <span class="pd-req" [class.ok]="assignedAmen(g) === g.required" [class.bad]="assignedAmen(g) > g.required">asignadas {{ assignedAmen(g) }} / requeridas {{ g.required }}</span></div>
              <table class="pd-tbl">
                <thead><tr><th>Amenity</th><th class="cn">Disp.</th><th class="cn">Dotar</th></tr></thead>
                <tbody>
                  @for (a of g.items; track a.productId) {
                    <tr>
                      <td class="nm">{{ a.name }} @if (a.reusable) { <span class="reu">reutilizable</span> }</td>
                      <td class="cn" [class.zero]="a.available === 0">{{ a.available }}</td>
                      <td class="cn"><p-inputNumber [(ngModel)]="a.enviar" [min]="0" [max]="a.available" inputStyleClass="qi" /></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="3" class="cn muted" style="padding:.6rem;">No hay amenities de <b>{{ g.category }}</b> con stock en AMENITIES - LIMPIEZA. Transfiérelos desde Almacén de Amenities → "Transferir a Limpieza".</td></tr>
                  }
                </tbody>
              </table>
              @if (g.items.length > 0 && assignedAmen(g) < g.required) { <p class="pd-short"><i class="pi pi-exclamation-triangle"></i> Faltan {{ g.required - assignedAmen(g) }} de <b>{{ g.category }}</b> en Limpieza. No se puede dotar hasta cubrir la regla.</p> }
              @if (assignedAmen(g) > g.required) { <p class="pd-short"><i class="pi pi-exclamation-triangle"></i> La regla pide {{ g.required }}; reduce la cantidad.</p> }
            </div>
          }
        }
        @if (primeraOver()) { <p class="pd-over"><i class="pi pi-exclamation-triangle"></i> Alguna cantidad supera el disponible.</p> }
        @else if (!primeraReady()) { <p class="pd-over"><i class="pi pi-info-circle"></i> La dotación debe cubrir <b>exactamente</b> la regla de cada categoría (ropa y amenities) para habilitar el botón.</p> }
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="primeraVisible = false" />
        <p-button label="Dotar habitación" icon="pi pi-check" [loading]="primeraBusy()" [disabled]="!primeraReady()" (onClick)="confirmPrimera()" />
      </ng-template>
    </p-dialog>

    <!-- Setear Habitación: deja la habitación sin ropa ni amenities (retornan al stock). -->
    <p-dialog [(visible)]="setearVisible" [modal]="true" header="Setear Habitación" [style]="{ width: '34rem', maxWidth: '95vw' }" styleClass="dk-dialog">
      <p class="pd-sub">Deja la habitación <b>sin ropa ni amenities</b>. La ropa <b>regresa al stock disponible del Almacén de Ropa</b> y los amenities a <b>AMENITIES - LIMPIEZA</b>. Úsalo para corregir descuadres o cuando la habitación cambia de tipo, y luego vuelve a dotarla.</p>
      <div class="form">
        <label>Habitación</label>
        <p-select [options]="rooms()" [(ngModel)]="setearRoomId" optionValue="id" [filter]="true" filterBy="number" placeholder="Selecciona una habitación" appendTo="body" styleClass="w">
          <ng-template let-r pTemplate="item">Hab. {{ r.number }} · {{ r.roomType?.name }} · Piso {{ r.floor || '-' }}</ng-template>
          <ng-template let-r pTemplate="selectedItem">Hab. {{ r.number }} · {{ r.roomType?.name }}</ng-template>
        </p-select>
        <p class="setear-warn"><i class="pi pi-exclamation-triangle"></i> Esta acción retira <b>todo</b> el inventario actual de la habitación seleccionada. No afecta la Dotación Base (la regla), solo el inventario real de esa habitación.</p>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="setearVisible = false" />
        <p-button label="Setear habitación" icon="pi pi-eraser" severity="danger" [loading]="setearBusy()" [disabled]="!setearRoomId" (onClick)="confirmSetear()" />
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
      .hdr-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .primera { background: #10b981; color: #04130d; border: 0; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; white-space: nowrap; } .primera:hover { background: #34d399; }
      .setear { background: #7f1d1d; color: #fff; border: 1px solid #b91c1c; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; white-space: nowrap; } .setear:hover { background: #991b1b; }
      .setear-warn { display: flex; align-items: flex-start; gap: 0.45rem; background: rgba(180,35,35,0.1); border: 1px solid rgba(180,35,35,0.35); border-radius: 10px; padding: 0.6rem 0.8rem; color: #f0c9c9; font-size: 0.82rem; margin-top: 0.6rem; } .setear-warn .pi { margin-top: 0.1rem; color: #f87171; } .setear-warn b { color: #fff; }
      .pd-sub { color: #8b97a8; font-size: 0.86rem; margin: 0 0 0.6rem; }
      .pd-bar { margin-bottom: 0.8rem; } :host ::ng-deep .w { width: 100%; }
      .pd-info { background: #101a2c; border: 1px solid #24344a; border-radius: 8px; padding: 0.5rem 0.8rem; font-size: 0.84rem; color: #cdd8e6; margin-bottom: 0.7rem; }
      .pd-sect { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #6ee7b7; margin: 1rem 0 0.5rem; }
      .reu { font-size: 0.66rem; font-weight: 700; background: #064e3b; color: #6ee7b7; border-radius: 999px; padding: 0.08rem 0.45rem; margin-left: 0.35rem; }
      .pd-cat { border: 1px solid #1f2a3a; border-radius: 10px; margin-bottom: 0.7rem; overflow: hidden; }
      .pd-cat-h { background: #101a2c; padding: 0.5rem 0.8rem; font-weight: 700; color: #cdd8e6; display: flex; justify-content: space-between; align-items: center; }
      .pd-req { font-size: 0.74rem; font-weight: 700; color: #fbbf24; background: #2a2410; border-radius: 999px; padding: 0.12rem 0.55rem; } .pd-req.ok { color: #6ee7b7; background: #06281f; } .pd-req.bad { color: #fca5a5; background: #2a1414; }
      .pd-size { font-size: 0.72rem; font-weight: 700; color: #93c5fd; background: #14233a; border-radius: 999px; padding: 0.12rem 0.55rem; margin-right: 0.4rem; }
      .pd-short { margin: 0.35rem 0 0; font-size: 0.8rem; color: #fca5a5; display: flex; align-items: center; gap: 0.4rem; }
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
  readonly amenGroups = signal<AmenGroup[]>([]);
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

  openPrimera(): void { this.primeraVisible = true; this.primeraRoomId = null; this.primera.set(null); this.planGroups.set([]); this.amenGroups.set([]); }

  // ── Setear Habitación (deja la habitación sin inventario; retorna al stock) ──
  setearVisible = false;
  setearRoomId: string | null = null;
  readonly setearBusy = signal(false);
  openSetear(): void { this.setearVisible = true; this.setearRoomId = null; }
  confirmSetear(): void {
    const id = this.setearRoomId;
    if (!id) return;
    this.setearBusy.set(true);
    this.http.post<ApiResponse<{ linen: number; amenities: number; rows: number }>>(`${this.api}/rooms/${id}/reset-inventory`, {}).subscribe({
      next: (r) => {
        this.setearBusy.set(false);
        this.setearVisible = false;
        const d = r.data;
        this.messages.add({ severity: 'success', summary: 'Habitación seteada', detail: d && d.rows ? `Se retiraron ${d.linen} prenda(s) y ${d.amenities} amenity(s); regresaron al stock.` : 'La habitación ya estaba sin inventario.' });
      },
      error: (e: HttpErrorResponse) => { this.setearBusy.set(false); this.messages.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'No se pudo setear la habitación.' }); },
    });
  }

  /**
   * Carga la regla del tipo (Dotación Base) y arma el plan que la RESPETA:
   * ropa = solo categorías con regla, filtradas por tamaño, cantidad exacta requerida;
   * amenities = solo categorías con regla, cantidad exacta requerida. Auto-rellena.
   */
  loadPrimera(): void {
    const id = this.primeraRoomId;
    if (!id) { this.primera.set(null); this.planGroups.set([]); this.amenGroups.set([]); return; }
    this.primera.set(null); this.planGroups.set([]); this.amenGroups.set([]);
    this.http.get<ApiResponse<PrimeraData>>(`${this.api}/rooms/${id}/linen`).subscribe((lin) => {
      const data = lin.data ?? null;
      this.primera.set(data);
      // OJO: /rooms/:id/inventory devuelve { room, rows }, no un array plano.
      this.http.get<ApiResponse<{ rows: { name: string; articleKind: string; size?: string | null; baseQty: number; source: string }[] }>>(`${this.api}/rooms/${id}/inventory`).subscribe((invr) => {
        // Reglas del tipo: ropa (categoría + tamaño + cantidad) y amenities (categoría + cantidad).
        const ropaReq = new Map<string, { qty: number; size: string | null; name: string }>();
        const amenReq = new Map<string, { qty: number; name: string }>();
        for (const row of invr.data?.rows ?? []) {
          if (row.source !== 'dotacion' || row.baseQty <= 0) continue;
          if (row.articleKind === 'LINEN_REUSABLE') ropaReq.set(row.name.toUpperCase(), { qty: row.baseQty, size: row.size ?? null, name: row.name });
          else if (row.articleKind === 'AMENITY') amenReq.set(row.name.toUpperCase(), { qty: row.baseQty, name: row.name });
        }
        // ── ROPA: solo categorías con regla; variantes = mismo tipo + mismo tamaño con stock. ──
        const avail = data?.floorAvailable ?? [];
        const groups: PlanGroup[] = [];
        for (const [, rule] of ropaReq) {
          const items = avail
            .filter((f) => (f.type || '').toUpperCase() === rule.name.toUpperCase() && (rule.size ? (f.size || '').toUpperCase() === rule.size.toUpperCase() : true))
            .map((f) => ({ ...f, enviar: 0 as number }));
          let left = rule.qty;
          for (const it of items) { const take = Math.min(left, it.available); it.enviar = take; left -= take; if (left <= 0) break; }
          groups.push({ category: rule.name, size: rule.size, required: rule.qty, items });
        }
        groups.sort((a, b) => a.category.localeCompare(b.category));
        this.planGroups.set(groups);
        // ── AMENITIES: solo categorías con regla; variantes = misma categoría con stock. ──
        const amenAvail = data?.amenitiesAvailable ?? [];
        const ag: AmenGroup[] = [];
        for (const [, rule] of amenReq) {
          const items = amenAvail
            .filter((a) => (a.category || '').toUpperCase() === rule.name.toUpperCase())
            .map((a) => ({ ...a, enviar: 0 as number }));
          let left = rule.qty;
          for (const it of items) { const take = Math.min(left, it.available); it.enviar = take; left -= take; if (left <= 0) break; }
          ag.push({ category: rule.name, required: rule.qty, items });
        }
        ag.sort((a, b) => a.category.localeCompare(b.category));
        this.amenGroups.set(ag);
      });
    });
  }
  assigned(g: PlanGroup): number { return g.items.reduce((a, f) => a + (Number(f.enviar) || 0), 0); }
  assignedAmen(g: AmenGroup): number { return g.items.reduce((a, f) => a + (Number(f.enviar) || 0), 0); }
  amenOver(): boolean { return this.amenGroups().some((g) => g.items.some((a) => (Number(a.enviar) || 0) > a.available)); }
  primeraOver(): boolean { return this.planGroups().some((g) => g.items.some((f) => (Number(f.enviar) || 0) > f.available)) || this.amenOver(); }
  /** Cada categoría de la regla (ropa y amenities) debe quedar EXACTA (asignadas === requeridas). */
  primeraReady(): boolean {
    if (this.primeraOver()) return false;
    const hasRule = this.planGroups().length > 0 || this.amenGroups().length > 0;
    const ropaOk = this.planGroups().every((g) => this.assigned(g) === g.required);
    const amenOk = this.amenGroups().every((g) => this.assignedAmen(g) === g.required);
    return hasRule && ropaOk && amenOk;
  }
  confirmPrimera(): void {
    const id = this.primeraRoomId;
    if (!id || !this.primeraReady()) return;
    const items = this.planGroups().flatMap((g) => g.items).filter((f) => (Number(f.enviar) || 0) > 0).map((f) => ({ linenItemId: f.linenItemId, quantity: Number(f.enviar) || 0 }));
    const amenities = this.amenGroups().flatMap((g) => g.items).filter((a) => (Number(a.enviar) || 0) > 0).map((a) => ({ productId: a.productId, quantity: Number(a.enviar) || 0 }));
    this.primeraBusy.set(true);
    this.http.post<ApiResponse<{ items: number; amenities: number }>>(`${this.api}/rooms/${id}/dote-linen`, { items, amenities }).subscribe({
      next: () => { this.primeraBusy.set(false); this.primeraVisible = false; this.messages.add({ severity: 'success', summary: 'Habitación dotada', detail: `${items.length} prenda(s) y ${amenities.length} amenity(s) asignados.` }); },
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
