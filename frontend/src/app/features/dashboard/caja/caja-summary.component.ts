import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { DashboardApiService, type CajaSummary } from '../dashboard-api.service';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  WALLET: 'Yape/Plin',
};

@Component({
  selector: 'app-caja-summary',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TagModule],
  template: `
    <section>
      <header class="head">
        <h1>Resumen de Caja</h1>
        <p class="muted">Estado del turno de caja en curso.</p>
      </header>

      @if (data(); as d) {
        @if (d.open && d.session) {
          <div class="grid">
            <div class="card kpi">
              <span class="kpi-label">Total cobrado</span>
              <span class="kpi-value">{{ d.totalIncome | number: '1.2-2' }}</span>
              <span class="muted">{{ d.salesCount }} ventas</span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Efectivo esperado</span>
              <span class="kpi-value">{{ d.expectedCash | number: '1.2-2' }}</span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Turno abierto desde</span>
              <span class="kpi-value sm">{{ d.session.openedAt | date: 'dd/MM HH:mm' }}</span>
              <span class="muted">Apertura: {{ d.session.openingAmount | number: '1.2-2' }}</span>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <h3>Cobros por método</h3>
              @for (m of methodEntries(d); track m.key) {
                <div class="kv"><span>{{ label(m.key) }}</span><strong>{{ m.value | number: '1.2-2' }}</strong></div>
              }
              <div class="kv total"><span>Total</span><strong>{{ d.totalIncome | number: '1.2-2' }}</strong></div>
            </div>
            <div class="card">
              <h3>Arqueo de efectivo</h3>
              <div class="kv"><span>Apertura</span><strong>{{ d.session.openingAmount | number: '1.2-2' }}</strong></div>
              <div class="kv"><span>Ingresos manuales</span><strong>{{ d.movements?.in | number: '1.2-2' }}</strong></div>
              <div class="kv"><span>Egresos manuales</span><strong>{{ d.movements?.out | number: '1.2-2' }}</strong></div>
              <div class="kv total"><span>Efectivo esperado</span><strong>{{ d.expectedCash | number: '1.2-2' }}</strong></div>
            </div>
          </div>
        } @else {
          <div class="card empty">
            <p-tag value="Sin turno abierto" severity="secondary" />
            <p class="muted">No hay un turno de caja abierto en esta sucursal. Ábrelo en Finanzas › Cajas.</p>
          </div>
        }
      } @else {
        <p class="muted">Cargando…</p>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 0 0 0.6rem; font-size: 1rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); font-size: 0.9rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .card { background: var(--p-content-background, #ffffff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .card.empty { display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .kpi { display: flex; flex-direction: column; gap: 0.25rem; }
      .kpi-label { font-size: 0.8rem; color: var(--p-text-muted-color, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; }
      .kpi-value { font-size: 2rem; font-weight: 700; color: var(--p-primary-color, #10b981); }
      .kpi-value.sm { font-size: 1.3rem; }
      .kv { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; font-size: 0.9rem; }
      .kv.total { border-top: 1px solid var(--p-content-border-color, #e5e7eb); margin-top: 0.4rem; padding-top: 0.6rem; }
    `,
  ],
})
export class CajaSummaryComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  readonly data = signal<CajaSummary | null>(null);

  ngOnInit(): void {
    this.api.caja().subscribe((res) => this.data.set(res.data));
  }

  label(key: string): string {
    return METHOD_LABEL[key] ?? key;
  }

  methodEntries(d: CajaSummary): { key: string; value: number }[] {
    const by = d.paymentsByMethod ?? {};
    return Object.keys(by).map((key) => ({ key, value: by[key] }));
  }
}
