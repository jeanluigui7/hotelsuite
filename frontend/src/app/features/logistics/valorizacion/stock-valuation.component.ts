import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { LogisticsApiService } from '../services/logistics-api.service';
import type { Valuation } from '../services/logistics.models';

@Component({
  selector: 'app-stock-valuation',
  standalone: true,
  imports: [DecimalPipe, TableModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Valorización de Stock</h1>
          <p class="muted">Valor del inventario al último costo.</p>
        </div>
        @if (data(); as d) {
          <div class="card"><span>Valor total</span><strong>{{ d.total | number: '1.2-2' }}</strong></div>
        }
      </header>

      <p-table [value]="data()?.items ?? []" [loading]="loading()" [paginator]="true" [rows]="15" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Producto</th><th style="width:8rem">Stock</th><th style="width:8rem">Costo</th><th style="width:9rem">Valor</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr><td>{{ r.name }}</td><td>{{ r.quantity }}</td><td>{{ r.cost | number: '1.2-2' }}</td><td>{{ r.value | number: '1.2-2' }}</td></tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted center">Sin productos.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      .card { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1rem 1.4rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .card span { color: var(--p-text-muted-color, #a1a1aa); font-size: 0.8rem; }
      .card strong { font-size: 1.4rem; }
    `,
  ],
})
export class StockValuationComponent implements OnInit {
  private readonly logistics = inject(LogisticsApiService);
  readonly data = signal<Valuation | null>(null);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.logistics.valuation().subscribe({
      next: (res) => { this.data.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
