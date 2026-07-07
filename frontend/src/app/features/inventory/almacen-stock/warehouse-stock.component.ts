import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { environment } from '../../../../environments/environment';
import type { ApiResponse } from '../../../core/models/api-response.model';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Warehouse, WarehouseStock, WarehouseType } from '../services/inventory.models';

interface LinenFloorRow { type: string; name: string; color: string | null; rem: number; sum: number; }
interface LinenFloor { floor: string; rows: LinenFloorRow[]; }
const LINEN_TYPE_LABEL: Record<string, string> = { TOALLA: 'Toalla', SABANA: 'Sábana', EDREDON: 'Edredón', AMENITY: 'Amenity' };

@Component({
  selector: 'app-warehouse-stock',
  standalone: true,
  imports: [DecimalPipe, FormsModule, SelectModule, InputTextModule],
  template: `
    <section class="ws">
      <header class="top">
        <div>
          <h1>{{ current()?.name || 'Stock por Almacén' }}</h1>
          <p class="muted">Existencias del almacén seleccionado.</p>
        </div>
        <p-select [options]="warehouses()" optionLabel="name" optionValue="id" [(ngModel)]="selectedId" (onChange)="loadStock()" placeholder="Selecciona almacén" styleClass="dk" />
      </header>

      @if (isLinen()) {
        <!-- Inventario de Ropa por Pisos (almacén ROPA - LIMPIEZA) -->
        <p class="muted sub">Inventario de ropa por pisos · REM = disponible en el piso · SUM = suministrado acumulado.</p>
        @for (f of linenFloors(); track f.floor) {
          <div class="floor">
            <div class="floor-h"><i class="pi pi-building"></i> PISO {{ f.floor }}</div>
            <div class="tablewrap">
              <table class="tbl">
                <thead><tr><th>Tipo</th><th>Artículo</th><th class="cn">REM (disp.)</th><th class="cn">SUM (suministrado)</th></tr></thead>
                <tbody>
                  @for (r of f.rows; track r.name) {
                    <tr><td>{{ linenTypeLabel(r.type) }}</td><td class="nm">{{ r.name }}</td><td class="cn"><strong>{{ r.rem }}</strong></td><td class="cn muted">{{ r.sum }}</td></tr>
                  } @empty { <tr><td colspan="4" class="muted center">Sin ropa en este piso.</td></tr> }
                </tbody>
              </table>
            </div>
          </div>
        } @empty { <p class="muted center empty">Aún no hay ropa transferida a pisos. Usa el atajo Ropa › Transferencia para enviar ropa a los pisos.</p> }
      } @else {
        <div class="cards">
          <div class="card"><span class="lbl">Artículos</span><strong>{{ stock()?.items?.length || 0 }}</strong></div>
          <div class="card low"><span class="lbl">Bajo mínimo</span><strong>{{ belowCount() }}</strong></div>
        </div>

        <div class="bar"><span class="search"><input pInputText placeholder="Buscar artículo..." [(ngModel)]="search" /><i class="pi pi-search"></i></span></div>

        <div class="tablewrap">
          <table class="tbl">
            <thead><tr><th>Código</th><th>Artículo</th><th class="cn">Stock</th><th class="cn">Mínimo</th><th class="cn">Estado</th></tr></thead>
            <tbody>
              @for (it of filtered(); track it.productId) {
                <tr [class.low-row]="it.belowReorder">
                  <td class="muted">{{ it.sku || '—' }}</td>
                  <td class="nm">{{ it.name }}</td>
                  <td class="cn"><strong [class.low]="it.belowReorder">{{ it.quantity }}</strong></td>
                  <td class="cn muted">{{ it.reorderPoint }}</td>
                  <td class="cn"><span class="pill" [class.on]="!it.belowReorder" [class.off]="it.belowReorder">{{ it.belowReorder ? 'Bajo stock' : 'OK' }}</span></td>
                </tr>
              } @empty { <tr><td colspan="5" class="muted center">{{ selectedId ? 'Sin artículos en este almacén.' : 'Selecciona un almacén.' }}</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .ws { background: #0b1018; min-height: 100%; margin: -1.5rem; padding: 1.5rem; color: #e6e9ef; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      h1 { margin: 0; color: #fff; font-size: 1.6rem; } .muted { color: #8b97a8; } .center { text-align: center; }
      :host ::ng-deep .dk { min-width: 240px; }
      .cards { display: flex; gap: 0.8rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .card { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; padding: 0.8rem 1.2rem; min-width: 120px; }
      .card .lbl { display: block; color: #8b97a8; font-size: 0.78rem; } .card strong { font-size: 1.5rem; color: #fff; }
      .card.low strong { color: #f87171; }
      .bar { margin-bottom: 0.8rem; }
      .search { position: relative; }
      .search input { background: #131b27; border: 1px solid #243245; color: #e6e9ef; border-radius: 8px; padding: 0.55rem 2.2rem 0.55rem 0.8rem; width: 260px; }
      .search i { position: absolute; right: 0.7rem; top: 50%; transform: translateY(-50%); color: #6b7a90; }
      .tablewrap { background: #0e1622; border: 1px solid #1f2a3a; border-radius: 12px; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 640px; }
      .tbl th { text-align: left; padding: 0.8rem 1.1rem; color: #9fb0c3; font-weight: 600; border-bottom: 1px solid #1f2a3a; font-size: 0.8rem; }
      .tbl td { padding: 0.75rem 1.1rem; border-bottom: 1px solid #16202e; }
      .tbl tr:last-child td { border-bottom: 0; } th.cn, td.cn { text-align: center; }
      .nm { font-weight: 600; color: #fff; } .low { color: #f87171; }
      .tbl tr.low-row { background: rgba(239,68,68,0.09); }
      .pill { display: inline-block; border-radius: 999px; padding: 0.18rem 0.7rem; font-size: 0.74rem; font-weight: 700; }
      .pill.on { background: rgba(16,185,129,0.2); color: #6ee7b7; } .pill.off { background: rgba(239,68,68,0.18); color: #fca5a5; }
      .sub { margin: 0 0 0.8rem; } .empty { padding: 2rem 0; }
      .floor { margin-bottom: 1rem; }
      .floor-h { display: flex; align-items: center; gap: 0.5rem; color: #93c5fd; font-weight: 700; margin-bottom: 0.4rem; font-size: 0.9rem; }
    `,
  ],
})
export class WarehouseStockComponent implements OnInit {
  private readonly inv = inject(InventoryApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly warehouses = signal<Warehouse[]>([]);
  readonly stock = signal<WarehouseStock | null>(null);
  readonly linenFloors = signal<LinenFloor[]>([]);
  selectedId: string | null = null;
  search = '';

  readonly current = computed(() => this.warehouses().find((w) => w.id === this.selectedId) ?? null);
  /** El almacén de limpieza (ROPA - LIMPIEZA) muestra el inventario de ropa por pisos. */
  isLinen(): boolean { return this.current()?.type === 'CLEANING'; }
  linenTypeLabel(t: string): string { return LINEN_TYPE_LABEL[t] ?? t; }
  belowCount(): number { return (this.stock()?.items ?? []).filter((i) => i.belowReorder).length; }

  filtered() {
    const q = this.search.toLowerCase();
    const items = this.stock()?.items ?? [];
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q));
  }

  ngOnInit(): void {
    this.inv.warehouses.list({ pageSize: 100, sortBy: 'name' }).subscribe((r) => {
      const ws = r.data ?? [];
      this.warehouses.set(ws);
      // Resolver el almacén por query param (?wh=<id>, ?name=<nombre> o ?type=<TYPE>) o el primero.
      // El nombre es útil cuando hay varios almacenes del mismo tipo (p. ej. varios PRODUCTS).
      this.route.queryParamMap.subscribe((pm) => {
        const wh = pm.get('wh');
        const name = pm.get('name');
        const type = pm.get('type') as WarehouseType | null;
        this.selectedId =
          (wh && ws.find((w) => w.id === wh)?.id) ||
          (name && ws.find((w) => w.name.toLowerCase() === name.toLowerCase())?.id) ||
          (type && ws.find((w) => w.type === type)?.id) ||
          ws[0]?.id ||
          null;
        this.loadStock();
      });
    });
  }

  loadStock(): void {
    if (!this.selectedId) { this.stock.set(null); this.linenFloors.set([]); return; }
    if (this.isLinen()) {
      // Almacén de ropa-limpieza: inventario por pisos (LinenStock rem/sum).
      this.stock.set(null);
      this.http.get<ApiResponse<{ floors: LinenFloor[] }>>(`${this.api}/cleaning/linen-inventory`)
        .subscribe({ next: (r) => this.linenFloors.set(r.data?.floors ?? []), error: () => this.linenFloors.set([]) });
      return;
    }
    this.linenFloors.set([]);
    this.inv.warehouseStock(this.selectedId).subscribe({
      next: (r) => this.stock.set(r.data ?? null),
      error: () => this.stock.set(null),
    });
  }
}
