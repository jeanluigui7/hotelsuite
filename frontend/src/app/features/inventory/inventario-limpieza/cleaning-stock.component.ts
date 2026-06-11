import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InventoryApiService } from '../services/inventory-api.service';
import type { Warehouse, WarehouseStockItem } from '../services/inventory.models';

const CLEANING_TYPES = ['CLEANING', 'AMENITIES'];

@Component({
  selector: 'app-cleaning-stock',
  standalone: true,
  imports: [FormsModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Inventario de Limpieza</h1>
          <p class="muted">Existencias actuales en los almacenes de limpieza y amenities.</p>
        </div>
        <p-select [options]="warehouses()" [(ngModel)]="selectedId" optionValue="id" optionLabel="name"
                  (onChange)="load()" placeholder="Almacén" styleClass="sel" />
      </header>

      @if (warehouses().length === 0) {
        <p class="muted">No hay almacenes de limpieza ni amenities. Créalos en Inventario › Almacenes.</p>
      } @else {
        <p-table [value]="items()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="items().length > 15" [rows]="15">
          <ng-template pTemplate="header">
            <tr><th>Producto</th><th>SKU</th><th style="width:9rem">Existencia</th><th style="width:9rem">Reposición</th><th style="width:9rem">Estado</th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-it>
            <tr>
              <td>{{ it.name }}</td>
              <td class="muted">{{ it.sku || '—' }}</td>
              <td><strong>{{ it.quantity }}</strong></td>
              <td>{{ it.reorderPoint }}</td>
              <td>
                <p-tag [value]="it.belowReorder ? 'Reponer' : 'OK'" [severity]="it.belowReorder ? 'warn' : 'success'" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Almacén sin existencias.</td></tr></ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .center { text-align: center; }
      :host ::ng-deep .sel { width: 240px; }
    `,
  ],
})
export class CleaningStockComponent implements OnInit {
  private readonly inventory = inject(InventoryApiService);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly items = signal<WarehouseStockItem[]>([]);
  readonly loading = signal(false);
  selectedId: string | null = null;

  ngOnInit(): void {
    this.inventory.warehouses.list({ pageSize: 100 }).subscribe((res) => {
      const cleaning = (res.data ?? []).filter((w) => CLEANING_TYPES.includes(w.type));
      this.warehouses.set(cleaning);
      if (cleaning.length) {
        this.selectedId = cleaning[0].id;
        this.load();
      }
    });
  }

  load(): void {
    if (!this.selectedId) return;
    this.loading.set(true);
    this.inventory.warehouseStock(this.selectedId).subscribe({
      next: (res) => {
        this.items.set(res.data?.items ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
