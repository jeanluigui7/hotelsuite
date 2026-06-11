import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { downloadCsv } from '../../../core/utils/export';
import { LogisticsApiService } from '../services/logistics-api.service';
import type { KardexEntry } from '../services/logistics.models';
import { InventoryApiService } from '../../inventory/services/inventory-api.service';
import type { Product } from '../../inventory/services/inventory.models';

const TYPE_LABEL: Record<string, string> = {
  IN: 'Ingreso',
  OUT: 'Salida',
  ADJUST: 'Ajuste',
  SALE: 'Venta',
  TRANSFER: 'Transferencia',
  PURCHASE: 'Compra',
};

@Component({
  selector: 'app-kardex',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, SelectModule, TableModule, TagModule, ButtonModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Kardex</h1>
          <p class="muted">Movimientos de un producto con saldo corrido.</p>
        </div>
        <div class="controls">
          <p-select [options]="products()" [(ngModel)]="selectedId" optionValue="id" optionLabel="name"
                    [filter]="true" filterBy="name" (onChange)="load()" placeholder="Producto" styleClass="sel" />
          <p-button label="Exportar CSV" icon="pi pi-file-excel" severity="secondary" (onClick)="exportCsv()" [disabled]="entries().length === 0" />
        </div>
      </header>

      @if (selectedId) {
        <div class="balance">Saldo actual: <strong>{{ balance() }}</strong></div>
      }

      <p-table [value]="entries()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="entries().length > 20" [rows]="20">
        <ng-template pTemplate="header">
          <tr><th>Fecha</th><th style="width:11rem">Tipo</th><th style="width:8rem">Cantidad</th><th style="width:8rem">Saldo</th><th style="width:8rem">Costo U.</th><th>Referencia</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-e>
          <tr>
            <td>{{ e.date | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="typeLabel(e.type)" [severity]="e.quantity < 0 ? 'danger' : 'success'" /></td>
            <td [class.neg]="e.quantity < 0">{{ e.quantity }}</td>
            <td><strong>{{ e.balance }}</strong></td>
            <td>{{ e.unitCost != null ? (e.unitCost | number: '1.2-2') : '—' }}</td>
            <td class="muted">{{ e.reference || '—' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="6" class="muted center">{{ selectedId ? 'Sin movimientos para este producto.' : 'Selecciona un producto.' }}</td></tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; gap: 1rem; flex-wrap: wrap; }
      .controls { display: flex; gap: 0.6rem; align-items: center; }
      .muted { color: var(--p-text-muted-color, #6b7280); }
      .center { text-align: center; }
      .neg { color: #dc2626; }
      .balance { margin-bottom: 0.85rem; font-size: 1rem; }
      :host ::ng-deep .sel { width: 260px; }
    `,
  ],
})
export class KardexComponent implements OnInit {
  private readonly logistics = inject(LogisticsApiService);
  private readonly inventory = inject(InventoryApiService);

  readonly products = signal<Product[]>([]);
  readonly entries = signal<KardexEntry[]>([]);
  readonly balance = signal(0);
  readonly loading = signal(false);
  selectedId: string | null = null;

  ngOnInit(): void {
    this.inventory.products.list({ pageSize: 300 }).subscribe((res) => this.products.set(res.data ?? []));
  }

  load(): void {
    if (!this.selectedId) return;
    this.loading.set(true);
    this.logistics.kardex(this.selectedId).subscribe({
      next: (res) => {
        this.entries.set(res.data?.items ?? []);
        this.balance.set(res.data?.balance ?? 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  typeLabel(t: string): string {
    return TYPE_LABEL[t] ?? t;
  }

  exportCsv(): void {
    const name = this.products().find((p) => p.id === this.selectedId)?.name ?? 'kardex';
    downloadCsv(
      `kardex-${name}`,
      ['Fecha', 'Tipo', 'Cantidad', 'Saldo', 'Costo U.', 'Referencia'],
      this.entries().map((e) => [e.date, this.typeLabel(e.type), e.quantity, e.balance, e.unitCost ?? '', e.reference ?? '']),
    );
  }
}
