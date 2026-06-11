import { Component, OnInit, inject, signal } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { DashboardApiService, type LimpiezaSummary } from '../dashboard-api.service';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  DONE: 'Terminada',
  INSPECTED: 'Inspeccionada',
};
const RESULT_LABEL: Record<string, string> = {
  PENDING: 'Sin inspeccionar',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};

@Component({
  selector: 'app-limpieza-summary',
  standalone: true,
  imports: [TagModule],
  template: `
    <section>
      <header class="head">
        <h1>Resumen de Limpieza</h1>
        <p class="muted">Carga de trabajo de housekeeping e inspecciones pendientes.</p>
      </header>

      @if (data(); as d) {
        <div class="grid">
          <div class="card kpi" [class.alert]="d.roomsCleaning > 0">
            <span class="kpi-label">Habitaciones en limpieza</span>
            <span class="kpi-value">{{ d.roomsCleaning }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Tareas activas</span>
            <span class="kpi-value">{{ d.pendingTasks }}</span>
            <span class="muted">Pendientes o en progreso</span>
          </div>
          <div class="card kpi" [class.alert]="d.pendingInspections > 0">
            <span class="kpi-label">Inspecciones pendientes</span>
            <span class="kpi-value">{{ d.pendingInspections }}</span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Tareas por estado</h3>
            @for (s of d.byStatus; track s.status) {
              <div class="kv"><span>{{ statusLabel(s.status) }}</span><strong>{{ s.count }}</strong></div>
            } @empty {
              <p class="muted">Sin tareas registradas.</p>
            }
          </div>
          <div class="card">
            <h3>Tareas por resultado</h3>
            @for (r of d.byResult; track r.result) {
              <div class="kv">
                <span><p-tag [value]="resultLabel(r.result)" [severity]="resultSeverity(r.result)" /></span>
                <strong>{{ r.count }}</strong>
              </div>
            } @empty {
              <p class="muted">Sin tareas registradas.</p>
            }
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
    `,
  ],
})
export class LimpiezaSummaryComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  readonly data = signal<LimpiezaSummary | null>(null);

  ngOnInit(): void {
    this.api.limpieza().subscribe((res) => this.data.set(res.data));
  }

  statusLabel(key: string): string {
    return STATUS_LABEL[key] ?? key;
  }
  resultLabel(key: string): string {
    return RESULT_LABEL[key] ?? key;
  }
  resultSeverity(key: string): 'success' | 'warn' | 'danger' | 'secondary' {
    switch (key) {
      case 'APPROVED':
        return 'success';
      case 'REJECTED':
        return 'danger';
      case 'PENDING':
        return 'warn';
      default:
        return 'secondary';
    }
  }
}
