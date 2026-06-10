import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { FinanceApiService } from '../services/finance-api.service';
import type { FiscalPanel } from '../services/finance.models';

@Component({
  selector: 'app-fiscal-panel',
  standalone: true,
  imports: [DecimalPipe, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Panel Fiscal</h1>
          <p class="muted">Resumen de comprobantes emitidos en la sucursal.</p>
        </div>
      </header>

      @if (panel(); as p) {
        <div class="cards">
          <div class="card"><span>Base imponible</span><strong>{{ p.totals.base | number: '1.2-2' }}</strong></div>
          <div class="card"><span>IGV</span><strong>{{ p.totals.tax | number: '1.2-2' }}</strong></div>
          <div class="card"><span>Total emitido</span><strong>{{ p.totals.total | number: '1.2-2' }}</strong></div>
          <div class="card"><span>Emitidos</span><strong>{{ p.issuedCount }}</strong></div>
          <div class="card"><span>Anulados</span><strong>{{ p.voidedCount }}</strong></div>
        </div>

        <h3>Por tipo de comprobante</h3>
        <p-table [value]="p.byType" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Tipo</th><th>Cantidad</th><th>Base</th><th>IGV</th><th>Total</th></tr></ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td>{{ r.type === 'BOLETA' ? 'Boleta' : 'Factura' }}</td>
              <td>{{ r.count }}</td>
              <td>{{ r.base | number: '1.2-2' }}</td>
              <td>{{ r.tax | number: '1.2-2' }}</td>
              <td>{{ r.total | number: '1.2-2' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin comprobantes emitidos.</td></tr></ng-template>
        </p-table>

        <h3>Notas de Crédito / Débito</h3>
        <p-table [value]="p.notesByType" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Tipo</th><th>Cantidad</th><th>Total</th></tr></ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td>{{ r.type === 'CREDIT' ? 'Crédito' : 'Débito' }}</td>
              <td>{{ r.count }}</td>
              <td>{{ r.total | number: '1.2-2' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="3" class="muted center">Sin notas.</td></tr></ng-template>
        </p-table>
      } @else {
        <p class="muted">Cargando…</p>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 1.5rem 0 0.6rem; font-size: 1rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
      .card { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.1rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .card span { color: var(--p-text-muted-color, #a1a1aa); font-size: 0.82rem; }
      .card strong { font-size: 1.3rem; }
    `,
  ],
})
export class FiscalPanelComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  readonly panel = signal<FiscalPanel | null>(null);

  ngOnInit(): void {
    this.finance.fiscalPanel().subscribe((res) => this.panel.set(res.data));
  }
}
