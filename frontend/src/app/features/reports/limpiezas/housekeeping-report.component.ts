import { Component, OnInit, inject, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ReportsApiService, type HousekeepingReport } from '../services/reports-api.service';

const STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  DONE: 'Completada',
  INSPECTED: 'Inspeccionada',
};
const RESULT: Record<string, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada' };

@Component({
  selector: 'app-housekeeping-report',
  standalone: true,
  imports: [TableModule],
  template: `
    <section>
      <header class="head"><h1>Reporte de Limpiezas</h1><p class="muted">Tareas de limpieza por estado y resultado de inspección.</p></header>
      @if (data(); as d) {
        <div class="cols">
          <div>
            <h3>Por estado</h3>
            <p-table [value]="d.byStatus" styleClass="p-datatable-sm">
              <ng-template pTemplate="header"><tr><th>Estado</th><th style="width:8rem">Tareas</th></tr></ng-template>
              <ng-template pTemplate="body" let-r><tr><td>{{ statusLabel(r.status) }}</td><td>{{ r.count }}</td></tr></ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="2" class="muted center">Sin datos.</td></tr></ng-template>
            </p-table>
          </div>
          <div>
            <h3>Por resultado de inspección</h3>
            <p-table [value]="d.byResult" styleClass="p-datatable-sm">
              <ng-template pTemplate="header"><tr><th>Resultado</th><th style="width:8rem">Tareas</th></tr></ng-template>
              <ng-template pTemplate="body" let-r><tr><td>{{ resultLabel(r.result) }}</td><td>{{ r.count }}</td></tr></ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="2" class="muted center">Sin datos.</td></tr></ng-template>
            </p-table>
          </div>
        </div>
      } @else { <p class="muted">Cargando…</p> }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { font-size: 1rem; margin: 0 0 0.5rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    `,
  ],
})
export class HousekeepingReportComponent implements OnInit {
  private readonly reports = inject(ReportsApiService);
  readonly data = signal<HousekeepingReport | null>(null);

  ngOnInit(): void {
    this.reports.housekeeping().subscribe((res) => this.data.set(res.data));
  }

  statusLabel(s: string): string {
    return STATUS[s] ?? s;
  }
  resultLabel(r: string): string {
    return RESULT[r] ?? r;
  }
}
