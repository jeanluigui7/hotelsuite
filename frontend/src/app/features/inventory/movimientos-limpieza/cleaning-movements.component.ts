import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InventoryApiService } from '../services/inventory-api.service';
import type { InventoryMovement, Warehouse } from '../services/inventory.models';

const CLEANING_TYPES = ['CLEANING', 'AMENITIES'];
const TYPE_LABEL: Record<string, string> = {
  PURCHASE: 'Ingreso',
  SALE: 'Salida (venta)',
  ADJUST: 'Ajuste',
  TRANSFER: 'Transferencia',
  CONSUMPTION: 'Consumo limpieza',
};

@Component({
  selector: 'app-cleaning-movements',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Movimientos de Limpieza</h1>
          <p class="muted">Kardex de los almacenes de limpieza y amenities.</p>
        </div>
        <p-select [options]="warehouses()" [(ngModel)]="selectedId" optionValue="id" optionLabel="name"
                  (onChange)="load()" placeholder="Almacén" styleClass="sel" />
      </header>

      @if (warehouses().length === 0) {
        <p class="muted">No hay almacenes de limpieza ni amenities. Créalos en Inventario › Almacenes.</p>
      } @else {
        <p-table [value]="movements()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="movements().length > 15" [rows]="15">
          <ng-template pTemplate="header">
            <tr><th>Fecha</th><th>Producto</th><th style="width:11rem">Tipo</th><th style="width:8rem">Cantidad</th><th>Referencia</th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-m>
            <tr>
              <td>{{ m.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
              <td>{{ m.productName }}</td>
              <td><p-tag [value]="typeLabel(m.type)" [severity]="m.quantity < 0 ? 'danger' : 'success'" /></td>
              <td [class.neg]="m.quantity < 0">{{ m.quantity | number: '1.0-0' }}</td>
              <td class="muted">{{ m.reference || '—' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin movimientos en este almacén.</td></tr></ng-template>
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
      .neg { color: #dc2626; }
      :host ::ng-deep .sel { width: 240px; }
    `,
  ],
})
export class CleaningMovementsComponent implements OnInit {
  private readonly inventory = inject(InventoryApiService);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly movements = signal<InventoryMovement[]>([]);
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
    this.inventory.listMovements({ warehouseId: this.selectedId, pageSize: 200 }).subscribe({
      next: (res) => {
        this.movements.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  typeLabel(t: string): string {
    return TYPE_LABEL[t] ?? t;
  }
}
