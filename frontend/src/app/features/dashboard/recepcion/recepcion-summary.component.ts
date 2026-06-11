import { Component, OnInit, inject, signal } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { DashboardApiService, type RecepcionSummary } from '../dashboard-api.service';

const STATUS_LABEL: Record<string, string> = {
  FREE: 'Libres',
  OCCUPIED: 'Ocupadas',
  CLEANING: 'En limpieza',
  MAINTENANCE: 'Mantenimiento',
};

@Component({
  selector: 'app-recepcion-summary',
  standalone: true,
  imports: [TagModule],
  template: `
    <section>
      <header class="head">
        <h1>Resumen de Recepción</h1>
        <p class="muted">Estado de habitaciones y movimiento del día.</p>
      </header>

      @if (data(); as d) {
        <div class="grid">
          <div class="card kpi">
            <span class="kpi-label">Ocupación</span>
            <span class="kpi-value">{{ d.rooms.occupancy }}%</span>
            <span class="muted">{{ d.rooms.byStatus['OCCUPIED'] }} de {{ d.rooms.total }} habitaciones</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Estancias activas</span>
            <span class="kpi-value">{{ d.activeStays }}</span>
          </div>
          <div class="card kpi" [class.alert]="d.pendingCheckouts > 0">
            <span class="kpi-label">Check-outs pendientes</span>
            <span class="kpi-value">{{ d.pendingCheckouts }}</span>
            <span class="muted">Pasaron su hora de salida</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Reservas próximas</span>
            <span class="kpi-value">{{ d.reservationsPending }}</span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Habitaciones por estado</h3>
            @for (s of statusEntries(d); track s.key) {
              <div class="kv">
                <span><p-tag [value]="label(s.key)" [severity]="severity(s.key)" /></span>
                <strong>{{ s.value }}</strong>
              </div>
            }
            <div class="kv total"><span>Total</span><strong>{{ d.rooms.total }}</strong></div>
          </div>

          <div class="card">
            <h3>Movimiento de hoy</h3>
            <div class="kv"><span>Check-ins</span><strong>{{ d.checkInsToday }}</strong></div>
            <div class="kv"><span>Check-outs</span><strong>{{ d.checkOutsToday }}</strong></div>
          </div>
        </div>
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
      .kpi { display: flex; flex-direction: column; gap: 0.25rem; }
      .kpi-label { font-size: 0.8rem; color: var(--p-text-muted-color, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; }
      .kpi-value { font-size: 2rem; font-weight: 700; color: var(--p-primary-color, #10b981); }
      .kpi.alert .kpi-value { color: #f59e0b; }
      .kv { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; font-size: 0.9rem; }
      .kv.total { border-top: 1px solid var(--p-content-border-color, #e5e7eb); margin-top: 0.4rem; padding-top: 0.6rem; }
    `,
  ],
})
export class RecepcionSummaryComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  readonly data = signal<RecepcionSummary | null>(null);

  ngOnInit(): void {
    this.api.recepcion().subscribe((res) => this.data.set(res.data));
  }

  statusEntries(d: RecepcionSummary): { key: string; value: number }[] {
    return ['FREE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'].map((key) => ({
      key,
      value: d.rooms.byStatus[key] ?? 0,
    }));
  }

  label(key: string): string {
    return STATUS_LABEL[key] ?? key;
  }

  severity(key: string): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
    switch (key) {
      case 'FREE':
        return 'success';
      case 'OCCUPIED':
        return 'info';
      case 'CLEANING':
        return 'warn';
      case 'MAINTENANCE':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
