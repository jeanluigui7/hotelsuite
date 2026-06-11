import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { downloadCsv } from '../../../core/utils/export';
import { ReportsApiService, type ProductLimitItem } from '../services/reports-api.service';

@Component({
  selector: 'app-product-limit',
  standalone: true,
  imports: [DecimalPipe, ButtonModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Simulador Límite de Productos</h1>
          <p class="muted">Stock vs. venta media diaria (últimos 30 días) y días de cobertura estimados.</p>
        </div>
        <p-button label="Exportar CSV" icon="pi pi-file-excel" severity="secondary" (onClick)="exportCsv()" [disabled]="items().length === 0" />
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="20" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Producto</th><th style="width:7rem">Stock</th><th style="width:9rem">Vendido (30d)</th><th style="width:9rem">Media diaria</th><th style="width:10rem">Días de cobertura</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td>{{ r.name }}</td>
            <td>{{ r.stock }}</td>
            <td>{{ r.sold30 }}</td>
            <td>{{ r.avgDaily | number: '1.0-2' }}</td>
            <td>
              @if (r.daysOfCover === null) { <span class="muted">— (sin ventas)</span> }
              @else { <p-tag [value]="r.daysOfCover + ' días'" [severity]="r.daysOfCover < 7 ? 'danger' : r.daysOfCover < 30 ? 'warn' : 'success'" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin productos.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
    `,
  ],
})
export class ProductLimitComponent implements OnInit {
  private readonly reports = inject(ReportsApiService);
  readonly items = signal<ProductLimitItem[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.reports.productLimit().subscribe({
      next: (res) => { this.items.set(res.data.items ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  exportCsv(): void {
    downloadCsv(
      'simulador-productos',
      ['Producto', 'Stock', 'Vendido 30d', 'Media diaria', 'Días de cobertura'],
      this.items().map((r) => [r.name, r.stock, r.sold30, r.avgDaily, r.daysOfCover ?? '—']),
    );
  }
}
