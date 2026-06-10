import { Component, OnInit, inject, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ReportsApiService, type PerformanceItem } from '../services/reports-api.service';

@Component({
  selector: 'app-performance',
  standalone: true,
  imports: [TableModule],
  template: `
    <section>
      <header class="head">
        <h1>Rendimiento General</h1>
        <p class="muted">Métricas del personal de la sucursal.</p>
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="15" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Usuario</th><th>Rol</th>
            <th style="width:11rem">Limpiezas hechas</th>
            <th style="width:9rem">Ventas</th>
            <th style="width:10rem">Asistencias</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.name }}</td>
            <td class="muted">{{ row.role }}</td>
            <td>{{ row.cleaningDone }}</td>
            <td>{{ row.salesCount }}</td>
            <td>{{ row.attendanceCount }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin datos.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
    `,
  ],
})
export class PerformanceComponent implements OnInit {
  private readonly reports = inject(ReportsApiService);
  readonly items = signal<PerformanceItem[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.reports.performance().subscribe({
      next: (res) => { this.items.set(res.data.items ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
