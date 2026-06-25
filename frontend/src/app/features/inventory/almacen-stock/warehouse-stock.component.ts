import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Warehouse, WarehouseStock, WarehouseType } from '../services/inventory.models';

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
    `,
  ],
})
export class WarehouseStockComponent implements OnInit {
  private readonly inv = inject(InventoryApiService);
  private readonly route = inject(ActivatedRoute);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly stock = signal<WarehouseStock | null>(null);
  selectedId: string | null = null;
  search = '';

  readonly current = computed(() => this.warehouses().find((w) => w.id === this.selectedId) ?? null);
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
      // Resolver el almacén por query param (?wh=<id> o ?type=<TYPE>) o el primero.
      this.route.queryParamMap.subscribe((pm) => {
        const wh = pm.get('wh');
        const type = pm.get('type') as WarehouseType | null;
        this.selectedId =
          (wh && ws.find((w) => w.id === wh)?.id) ||
          (type && ws.find((w) => w.type === type)?.id) ||
          ws[0]?.id ||
          null;
        this.loadStock();
      });
    });
  }

  loadStock(): void {
    if (!this.selectedId) { this.stock.set(null); return; }
    this.inv.warehouseStock(this.selectedId).subscribe({
      next: (r) => this.stock.set(r.data ?? null),
      error: () => this.stock.set(null),
    });
  }
}
