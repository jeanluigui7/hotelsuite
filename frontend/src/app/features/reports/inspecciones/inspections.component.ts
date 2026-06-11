import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { downloadCsv } from '../../../core/utils/export';
import { ReportsApiService, type InspectionItem } from '../services/reports-api.service';

@Component({
  selector: 'app-inspections-report',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div><h1>Inspecciones de Limpieza</h1><p class="muted">Resultado por ítem de checklist en cada inspección.</p></div>
        <p-button label="Exportar CSV" icon="pi pi-file-excel" severity="secondary" (onClick)="exportCsv()" [disabled]="items().length === 0" />
      </header>

      <div class="filters">
        <div><label>Desde</label><input pInputText type="date" [(ngModel)]="from" /></div>
        <div><label>Hasta</label><input pInputText type="date" [(ngModel)]="to" /></div>
        <p-button label="Aplicar" icon="pi pi-search" (onClick)="load()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="items().length > 20" [rows]="20" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width:11rem">Fecha</th><th style="width:7rem">Habitación</th><th>Ítem</th><th style="width:8rem">Resultado</th><th>Nota</th><th>Inspector</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td class="muted">{{ r.date ? (r.date | date: 'dd/MM/yy HH:mm') : '—' }}</td>
            <td>{{ r.room }}</td>
            <td>{{ r.checklistItem }}</td>
            <td><p-tag [value]="r.passed ? 'Aprobado' : 'Falló'" [severity]="r.passed ? 'success' : 'danger'" /></td>
            <td class="muted">{{ r.note || '—' }}</td>
            <td>{{ r.inspector }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin inspecciones en el rango.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .center { text-align: center; }
      .filters { display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1.25rem; }
      .filters label { display: block; font-size: 0.8rem; color: var(--p-text-muted-color, #6b7280); margin-bottom: 0.25rem; }
    `,
  ],
})
export class InspectionsReportComponent implements OnInit {
  private readonly reports = inject(ReportsApiService);

  readonly items = signal<InspectionItem[]>([]);
  readonly loading = signal(false);
  from = '';
  to = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reports.inspections(this.from || undefined, this.to || undefined).subscribe({
      next: (res) => {
        this.items.set(res.data?.items ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  exportCsv(): void {
    downloadCsv(
      'inspecciones-limpieza',
      ['Fecha', 'Habitación', 'Ítem', 'Resultado', 'Nota', 'Inspector'],
      this.items().map((r) => [r.date ?? '', r.room, r.checklistItem, r.passed ? 'Aprobado' : 'Falló', r.note ?? '', r.inspector]),
    );
  }
}
