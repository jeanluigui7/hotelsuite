import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { Invoice, Sale } from '../services/finance.models';
import { buildInvoiceReceipt, buildSaleReceipt } from './receipt';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ButtonModule, TableModule, TagModule, TooltipModule],
  template: `
    <section>
      <header class="head">
        <div>
          <h1>Tickets</h1>
          <p class="muted">Impresión de tickets de venta y comprobantes vía QZ Tray.</p>
        </div>
        <div class="qz">
          <p-tag [value]="statusLabel()" [severity]="statusSeverity()" />
          <p-button label="Conectar QZ" icon="pi pi-link" severity="secondary" size="small"
                    [disabled]="printing.status() === 'connected'" (onClick)="connect()" />
        </div>
      </header>

      <h3>Ventas recientes</h3>
      <p-table [value]="sales()" [loading]="loading()" [paginator]="true" [rows]="8" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Cliente</th><th style="width:7rem">Total</th><th style="width:11rem">Fecha</th><th style="width:8rem">Estado</th><th style="width:7rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.customerName ?? 'Cliente' }}</td>
            <td>{{ row.total | number: '1.2-2' }}</td>
            <td>{{ row.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
            <td><p-tag [value]="saleStatus(row.status)" [severity]="row.status === 'PAID' ? 'success' : row.status === 'OPEN' ? 'warn' : 'danger'" /></td>
            <td><p-button icon="pi pi-print" [text]="true" (onClick)="printSale(row)" pTooltip="Imprimir" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin ventas.</td></tr></ng-template>
      </p-table>

      <h3>Comprobantes</h3>
      <p-table [value]="invoices()" [loading]="loading()" [paginator]="true" [rows]="8" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Folio</th><th>Cliente</th><th style="width:7rem">Total</th><th style="width:8rem">Estado</th><th style="width:7rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td><strong>{{ row.folio }}</strong></td>
            <td>{{ row.customerName }}</td>
            <td>{{ row.total | number: '1.2-2' }}</td>
            <td><p-tag [value]="row.status === 'ISSUED' ? 'Emitido' : 'Anulado'" [severity]="row.status === 'ISSUED' ? 'success' : 'danger'" /></td>
            <td><p-button icon="pi pi-print" [text]="true" (onClick)="printInvoice(row)" pTooltip="Imprimir" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin comprobantes.</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 1.4rem 0 0.5rem; font-size: 1rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.5rem; }
      .qz { display: flex; align-items: center; gap: 0.6rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
    `,
  ],
})
export class TicketsComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  readonly printing = inject(PrintingService);

  readonly sales = signal<Sale[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.finance.listSales({ pageSize: 30, sortBy: 'createdAt', sortDir: 'desc' }).subscribe((res) => {
      this.sales.set(res.data ?? []);
      this.loading.set(false);
    });
    this.finance.listInvoices({ pageSize: 30, sortBy: 'issuedAt', sortDir: 'desc' }).subscribe((res) =>
      this.invoices.set(res.data ?? []),
    );
  }

  statusLabel(): string {
    const s = this.printing.status();
    return s === 'connected' ? 'QZ conectado' : s === 'connecting' ? 'Conectando…' : 'QZ desconectado';
  }
  statusSeverity(): 'success' | 'warn' | 'danger' {
    const s = this.printing.status();
    return s === 'connected' ? 'success' : s === 'connecting' ? 'warn' : 'danger';
  }
  saleStatus(s: string): string {
    return s === 'PAID' ? 'Pagada' : s === 'OPEN' ? 'Pendiente' : 'Anulada';
  }

  async connect(): Promise<void> {
    try {
      await this.printing.connect();
      this.messages.add({ severity: 'success', summary: 'QZ Tray', detail: 'Conectado.' });
    } catch {
      this.messages.add({ severity: 'error', summary: 'QZ Tray', detail: 'No se pudo conectar. ¿Está QZ Tray corriendo?' });
    }
  }

  private branchName(): string {
    return this.auth.activeBranch()?.name ?? 'HotelSuite';
  }

  async printSale(sale: Sale): Promise<void> {
    try {
      await this.printing.printHtml(buildSaleReceipt(sale, this.branchName()));
      this.messages.add({ severity: 'success', summary: 'Impresión', detail: 'Ticket enviado.' });
    } catch {
      this.messages.add({ severity: 'error', summary: 'Impresión', detail: 'No se pudo imprimir (verifica QZ Tray).' });
    }
  }

  async printInvoice(inv: Invoice): Promise<void> {
    try {
      await this.printing.printHtml(buildInvoiceReceipt(inv, this.branchName()));
      this.messages.add({ severity: 'success', summary: 'Impresión', detail: 'Comprobante enviado.' });
    } catch {
      this.messages.add({ severity: 'error', summary: 'Impresión', detail: 'No se pudo imprimir (verifica QZ Tray).' });
    }
  }
}
