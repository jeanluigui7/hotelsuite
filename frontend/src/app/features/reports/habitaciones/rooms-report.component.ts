import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ReportsApiService, type RoomsReport } from '../services/reports-api.service';

const LABEL: Record<string, string> = {
  FREE: 'Libres',
  OCCUPIED: 'Ocupadas',
  CLEANING: 'Limpieza',
  MAINTENANCE: 'Mantenimiento',
};

@Component({
  selector: 'app-rooms-report',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <section>
      <header class="head"><h1>Reporte de Habitaciones</h1><p class="muted">Estado actual y ocupación.</p></header>
      @if (data(); as d) {
        <div class="cards">
          @for (k of order; track k) {
            <div class="card" [class]="'st-' + k"><span>{{ label(k) }}</span><strong>{{ d.byStatus[k] }}</strong></div>
          }
          <div class="card total"><span>Ocupación</span><strong>{{ d.occupancy | number: '1.0-1' }}%</strong></div>
        </div>
      } @else { <p class="muted">Cargando…</p> }
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
      .card { background: var(--p-content-background, #1f1f23); border: 1px solid var(--p-content-border-color, #2b2b30); border-left-width: 5px; border-radius: 12px; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.3rem; }
      .card span { color: var(--p-text-muted-color, #a1a1aa); font-size: 0.82rem; }
      .card strong { font-size: 1.6rem; }
      .card.st-FREE { border-left-color: #f59e0b; }
      .card.st-OCCUPIED { border-left-color: #3b82f6; }
      .card.st-CLEANING { border-left-color: #14b8a6; }
      .card.st-MAINTENANCE { border-left-color: #ef4444; }
      .card.total { border-left-color: var(--p-primary-color, #34d399); }
    `,
  ],
})
export class RoomsReportComponent implements OnInit {
  private readonly reports = inject(ReportsApiService);
  readonly data = signal<RoomsReport | null>(null);
  readonly order = ['FREE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];

  ngOnInit(): void {
    this.reports.rooms().subscribe((res) => this.data.set(res.data));
  }

  label(k: string): string {
    return LABEL[k] ?? k;
  }
}
