import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { downloadCsv } from '../../../core/utils/export';
import { ReportsApiService, type SalesDetailedItem } from '../services/reports-api.service';

@Component({
  selector: 'app-sales-detailed',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, InputTextModule, TableModule],
  template: `
    <section>
      <header class="head">
        <div><h1>Ventas Detalladas</h1><p class="muted">Líneas de venta por rango de fechas.</p></div>
        <p-button label="Exportar CSV" icon="pi pi-file-excel" severity="secondary" (onClick)="exportCsv()" [disabled]="items().length === 0" />
      </header>

      <div class="filters">
        <div><label>Desde</label><input pInputText type="date" [(ngModel)]="from" /></div>
        <div><label>Hasta</label><input pInputText type="date" [(ngModel)]="to" /></div>
        <p-button label="Aplicar" icon="pi pi-search" (onClick)="load()" />
      </div>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="20" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th style="width:6rem">Cant.</th><th style="width:7rem">P.U.</th><th style="width:8rem">Subtotal</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td class="muted">{{ r.date | date: 'dd/MM/yy HH:mm' }}</td>
            <td>{{ r.customer }}</td>
            <td>{{ r.description }}</td>
            <td>{{ r.quantity }}</td>
            <td>{{ r.unitPrice | number: '1.2-2' }}</td>
            <td>{{ r.subtotal | number: '1.2-2' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted center">Sin ventas en el rango.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      .filters { display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; }
      .filters label { display: block; font-size: 0.82rem; color: var(--p-text-muted-color, #a1a1aa); margin-bottom: 0.3rem; }
    `,
  ],
})
export class SalesDetailedComponent implements OnInit {
  private readonly reports = inject(ReportsApiService);
  readonly items = signal<SalesDetailedItem[]>([]);
  readonly loading = signal(false);
  from = '';
  to = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reports.salesDetailed(this.from || undefined, this.to || undefined).subscribe({
      next: (res) => { this.items.set(res.data.items ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  exportCsv(): void {
    downloadCsv(
      'ventas-detalladas',
      ['Fecha', 'Cliente', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal'],
      this.items().map((r) => [
        new Date(r.date).toLocaleString('es-PE'),
        r.customer,
        r.description,
        r.quantity,
        Number(r.unitPrice).toFixed(2),
        Number(r.subtotal).toFixed(2),
      ]),
    );
  }
}
