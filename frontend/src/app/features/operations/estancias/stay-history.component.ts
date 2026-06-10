import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule, type TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OperationsApiService } from '../services/operations-api.service';
import type { Stay } from '../services/operations.models';

const STATUS_FILTER = [
  { label: 'Todas', value: '' },
  { label: 'Abiertas', value: 'OPEN' },
  { label: 'Cerradas', value: 'CLOSED' },
  { label: 'Canceladas', value: 'CANCELLED' },
];

const STATUS_META: Record<string, { label: string; severity: 'success' | 'secondary' | 'danger' }> = {
  OPEN: { label: 'Abierta', severity: 'success' },
  CLOSED: { label: 'Cerrada', severity: 'secondary' },
  CANCELLED: { label: 'Cancelada', severity: 'danger' },
};

@Component({
  selector: 'app-stay-history',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule, SelectModule, TableModule, TagModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Historial de Estancias</h1>
          <p class="muted">Estancias registradas en la sucursal activa.</p>
        </div>
      </header>

      <div class="toolbar">
        <input pInputText placeholder="Buscar huésped o documento…" [(ngModel)]="search" (keyup.enter)="reload()" />
        <p-select [options]="statusFilter" optionLabel="label" optionValue="value" [(ngModel)]="status" (onChange)="reload()" styleClass="status-sel" />
        <p-button label="Buscar" severity="secondary" (onClick)="reload()" />
      </div>

      <p-table
        [value]="items()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="total()"
        [loading]="loading()"
        dataKey="id"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th style="width: 6rem">Hab.</th>
            <th>Huésped</th>
            <th>Tarifa</th>
            <th pSortableColumn="checkInAt">Check-in</th>
            <th>Salida prevista</th>
            <th>Check-out</th>
            <th style="width: 7rem">Precio</th>
            <th style="width: 8rem">Estado</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.room.number }}</td>
            <td>
              {{ row.guest.firstName }} {{ row.guest.lastName }}
              <div class="muted small">{{ row.guest.documentNumber }}</div>
            </td>
            <td>{{ row.rate?.label ?? '—' }}</td>
            <td>{{ row.checkInAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td>{{ row.plannedCheckoutAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td>{{ row.checkOutAt ? (row.checkOutAt | date: 'dd/MM/yy HH:mm') : '—' }}</td>
            <td>{{ row.priceAgreed }}</td>
            <td><p-tag [value]="statusMeta(row.status).label" [severity]="statusMeta(row.status).severity" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" class="muted center">Sin estancias.</td></tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .small { font-size: 0.78rem; }
      .center { text-align: center; }
      .head { margin-bottom: 1.25rem; }
      .toolbar { display: flex; gap: 0.6rem; margin-bottom: 1rem; }
      .toolbar input { width: 300px; max-width: 100%; }
      :host ::ng-deep .status-sel { width: 160px; }
    `,
  ],
})
export class StayHistoryComponent implements OnInit {
  private readonly ops = inject(OperationsApiService);

  readonly items = signal<Stay[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly statusFilter = STATUS_FILTER;
  readonly pageSize = 20;

  search = '';
  status = '';
  private lastEvent: TableLazyLoadEvent | null = null;

  ngOnInit(): void {
    this.load({ first: 0, rows: this.pageSize });
  }

  statusMeta(s: string) {
    return STATUS_META[s] ?? { label: s, severity: 'secondary' as const };
  }

  load(event: TableLazyLoadEvent): void {
    this.lastEvent = event;
    const rows = event.rows ?? this.pageSize;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    const sortField = typeof event.sortField === 'string' ? event.sortField : undefined;
    this.loading.set(true);
    this.ops
      .stays({
        page,
        pageSize: rows,
        sortBy: sortField,
        sortDir: event.sortOrder === 1 ? 'asc' : 'desc',
        search: this.search || undefined,
        status: this.status || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.data ?? []);
          this.total.set(res.meta?.total ?? 0);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  reload(): void {
    this.load(this.lastEvent ?? { first: 0, rows: this.pageSize });
  }
}
