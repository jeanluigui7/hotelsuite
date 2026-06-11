import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { DashboardApiService, type TurnoSummary } from '../dashboard-api.service';

@Component({
  selector: 'app-turno-summary',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TagModule],
  template: `
    <section>
      <header class="head">
        <h1>Control de Turno</h1>
        <p class="muted">Quién tiene el turno abierto y su actividad.</p>
      </header>

      @if (data(); as d) {
        @if (d.open && d.session) {
          <div class="grid">
            <div class="card kpi">
              <span class="kpi-label">Responsable</span>
              <span class="kpi-value sm">{{ d.session.openedBy }}</span>
              <span class="muted">Desde {{ d.session.openedAt | date: 'dd/MM HH:mm' }}</span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Ventas del turno</span>
              <span class="kpi-value">{{ d.salesCount }}</span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Movimientos de caja</span>
              <span class="kpi-value">{{ d.movementsCount }}</span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Monto esperado</span>
              <span class="kpi-value">{{ d.expectedAmount | number: '1.2-2' }}</span>
            </div>
          </div>
          <div class="card note">
            <p-tag value="Turno abierto" severity="success" />
            <span class="muted">El cierre y arqueo detallado se hacen en Finanzas › Cajas y Reportes › Cuadro de Turno.</span>
          </div>
        } @else {
          <div class="card empty">
            <p-tag value="Sin turno abierto" severity="secondary" />
            <p class="muted">No hay un turno de caja abierto en esta sucursal.</p>
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
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); font-size: 0.9rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .card { background: var(--p-content-background, #ffffff); border: 1px solid var(--p-content-border-color, #e5e7eb); border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .card.empty, .card.note { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
      .card.empty { flex-direction: column; align-items: flex-start; }
      .kpi { display: flex; flex-direction: column; gap: 0.25rem; }
      .kpi-label { font-size: 0.8rem; color: var(--p-text-muted-color, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; }
      .kpi-value { font-size: 2rem; font-weight: 700; color: var(--p-primary-color, #10b981); }
      .kpi-value.sm { font-size: 1.3rem; }
    `,
  ],
})
export class TurnoSummaryComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  readonly data = signal<TurnoSummary | null>(null);

  ngOnInit(): void {
    this.api.turno().subscribe((res) => this.data.set(res.data));
  }
}
