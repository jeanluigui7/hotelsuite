import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { FinanceApiService } from '../../finance/services/finance-api.service';
import type { CashSession, SessionReport } from '../../finance/services/finance.models';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  WALLET: 'Yape/Plin',
};

@Component({
  selector: 'app-turn-report',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Cuadro de Turno</h1>
          <p class="muted">Resumen de cierre de caja por turno.</p>
        </div>
        <p-select [options]="sessions()" [(ngModel)]="selectedId" optionValue="id" (onChange)="loadReport()"
                  placeholder="Seleccionar turno" styleClass="sel">
          <ng-template let-s pTemplate="item">{{ s.openedAt | date: 'dd/MM/yy HH:mm' }} · {{ s.status === 'OPEN' ? 'Abierto' : 'Cerrado' }}</ng-template>
          <ng-template let-s pTemplate="selectedItem">{{ s.openedAt | date: 'dd/MM/yy HH:mm' }}</ng-template>
        </p-select>
      </header>

      @if (report(); as r) {
        <div class="grid">
          <div class="card">
            <h3>Turno</h3>
            <div class="kv"><span>Apertura</span><strong>{{ r.session.openedAt | date: 'dd/MM/yy HH:mm' }}</strong></div>
            <div class="kv"><span>Cierre</span><strong>{{ r.session.closedAt ? (r.session.closedAt | date: 'dd/MM/yy HH:mm') : '—' }}</strong></div>
            <div class="kv"><span>Estado</span><p-tag [value]="r.session.status === 'OPEN' ? 'Abierto' : 'Cerrado'" [severity]="r.session.status === 'OPEN' ? 'success' : 'secondary'" /></div>
            <div class="kv"><span>Monto inicial</span><strong>{{ r.session.openingAmount | number: '1.2-2' }}</strong></div>
            <div class="kv"><span>Ventas</span><strong>{{ r.summary.salesCount }}</strong></div>
          </div>

          <div class="card">
            <h3>Cobros por método</h3>
            @for (m of methodEntries(r); track m.key) {
              <div class="kv"><span>{{ label(m.key) }}</span><strong>{{ m.value | number: '1.2-2' }}</strong></div>
            }
            <div class="kv total"><span>Total cobrado</span><strong>{{ r.summary.totalCollected | number: '1.2-2' }}</strong></div>
          </div>

          <div class="card">
            <h3>Arqueo de efectivo</h3>
            <div class="kv"><span>Ingresos</span><strong>{{ r.summary.movementsIn ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="kv"><span>Egresos</span><strong>{{ r.summary.movementsOut ?? 0 | number: '1.2-2' }}</strong></div>
            <div class="kv"><span>Efectivo esperado</span><strong>{{ r.summary.expectedCash | number: '1.2-2' }}</strong></div>
            <div class="kv"><span>Contado</span><strong>{{ r.countedAmount != null ? (r.countedAmount | number: '1.2-2') : '—' }}</strong></div>
            @if (r.difference !== null) {
              <div class="kv total" [class.neg]="r.difference < 0"><span>Diferencia</span><strong>{{ r.difference | number: '1.2-2' }}</strong></div>
            }
          </div>
        </div>

        <h3 class="section">Ventas por artículo</h3>
        <p-table [value]="r.byItem" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Artículo</th><th style="width:8rem">Cantidad</th><th style="width:9rem">Total</th></tr></ng-template>
          <ng-template pTemplate="body" let-it>
            <tr><td>{{ it.description }}</td><td>{{ it.quantity }}</td><td>{{ it.total | number: '1.2-2' }}</td></tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="3" class="muted center">Sin ventas.</td></tr></ng-template>
        </p-table>

        <h3 class="section">Movimientos</h3>
        <p-table [value]="r.movements" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Tipo</th><th>Concepto</th><th style="width:9rem">Monto</th><th style="width:11rem">Fecha</th></tr></ng-template>
          <ng-template pTemplate="body" let-m>
            <tr>
              <td><p-tag [value]="m.type === 'IN' ? 'Ingreso' : 'Egreso'" [severity]="m.type === 'IN' ? 'success' : 'danger'" /></td>
              <td>{{ m.concept }}</td><td>{{ m.amount | number: '1.2-2' }}</td><td>{{ m.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted center">Sin movimientos.</td></tr></ng-template>
        </p-table>
      } @else {
        <p class="muted">Selecciona un turno para ver su cuadro.</p>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 0 0 0.6rem; font-size: 1rem; }
      h3.section { margin: 1.5rem 0 0.6rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      :host ::ng-deep .sel { width: 240px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
      .card { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-radius: 12px; padding: 1.25rem; }
      .kv { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.9rem; }
      .kv.total { border-top: 1px solid var(--p-content-border-color, #2b2b30); margin-top: 0.4rem; padding-top: 0.6rem; }
      .kv.neg strong { color: #f87171; }
    `,
  ],
})
export class TurnReportComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);

  readonly sessions = signal<CashSession[]>([]);
  readonly report = signal<SessionReport | null>(null);
  selectedId: string | null = null;

  ngOnInit(): void {
    this.finance.listSessions({ pageSize: 50 }).subscribe((res) => {
      this.sessions.set(res.data ?? []);
      if (res.data?.length) {
        this.selectedId = res.data[0].id;
        this.loadReport();
      }
    });
  }

  label(key: string): string {
    return METHOD_LABEL[key] ?? key;
  }

  methodEntries(r: SessionReport): { key: string; value: number }[] {
    return Object.keys(r.summary.byMethod).map((key) => ({ key, value: r.summary.byMethod[key] }));
  }

  loadReport(): void {
    if (!this.selectedId) return;
    this.finance.sessionReport(this.selectedId).subscribe((res) => this.report.set(res.data));
  }
}
