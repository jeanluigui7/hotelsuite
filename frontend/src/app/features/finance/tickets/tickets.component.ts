import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { PrintingService } from '../../../core/printing/printing.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { Invoice, Sale } from '../services/finance.models';
import { buildInvoiceReceipt, buildSaleReceipt } from './receipt';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ButtonModule, TableModule, TagModule, TooltipModule, DialogModule],
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

      @if (printing.status() !== 'connected') {
        <div class="hint">
          <i class="pi pi-info-circle"></i>
          QZ Tray no está conectado: la impresión abrirá una <strong>vista previa</strong> y usará la impresora del navegador.
        </div>
      }

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
            <td class="actions">
              <p-button icon="pi pi-eye" [text]="true" severity="secondary" (onClick)="previewSale(row)" pTooltip="Vista previa" />
              <p-button icon="pi pi-print" [text]="true" (onClick)="printSale(row)" pTooltip="Imprimir" />
            </td>
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
            <td class="actions">
              <p-button icon="pi pi-eye" [text]="true" severity="secondary" (onClick)="previewInvoice(row)" pTooltip="Vista previa" />
              <p-button icon="pi pi-print" [text]="true" (onClick)="printInvoice(row)" pTooltip="Imprimir" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="muted center">Sin comprobantes.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [(visible)]="previewVisible" [modal]="true" [header]="previewTitle()" [style]="{ width: '24rem' }" [dismissableMask]="true">
      <div class="preview">
        <iframe [srcdoc]="previewSrc()" title="Vista previa de impresión"></iframe>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cerrar" [text]="true" (onClick)="previewVisible = false" />
        @if (printing.status() === 'connected') {
          <p-button label="Imprimir en QZ" icon="pi pi-bolt" severity="secondary" (onClick)="printPreviewQz()" />
        }
        <p-button label="Imprimir" icon="pi pi-print" (onClick)="printPreview()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      h1 { margin: 0; font-size: 1.4rem; }
      h3 { margin: 1.4rem 0 0.5rem; font-size: 1rem; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.5rem; }
      .qz { display: flex; align-items: center; gap: 0.6rem; }
      .muted { color: var(--p-text-muted-color, #a1a1aa); }
      .center { text-align: center; }
      .actions { display: flex; gap: 0.15rem; }
      .hint {
        display: flex; align-items: center; gap: 0.5rem;
        background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
        padding: 0.6rem 0.85rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem;
      }
      .preview { display: flex; justify-content: center; background: #f1f5f9; padding: 0.75rem; border-radius: 8px; }
      .preview iframe { width: 300px; height: 420px; border: 1px solid #e5e7eb; background: #fff; }
    `,
  ],
})
export class TicketsComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly printing = inject(PrintingService);

  readonly sales = signal<Sale[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(false);

  // Vista previa (fallback sin QZ)
  previewVisible = false;
  readonly previewTitle = signal('Vista previa');
  readonly previewSrc = signal<SafeHtml | string>('');
  private previewHtml = '';

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

  /** Vista previa del ticket (siempre disponible). */
  previewSale(sale: Sale): void {
    this.openPreview(buildSaleReceipt(sale, this.branchName()), `Ticket — ${sale.customerName ?? 'Cliente'}`);
  }

  /** Vista previa del comprobante (siempre disponible). */
  previewInvoice(inv: Invoice): void {
    this.openPreview(buildInvoiceReceipt(inv, this.branchName()), `Comprobante — ${inv.folio}`);
  }

  async printSale(sale: Sale): Promise<void> {
    await this.printOrPreview(buildSaleReceipt(sale, this.branchName()), `Ticket — ${sale.customerName ?? 'Cliente'}`, 'Ticket');
  }

  async printInvoice(inv: Invoice): Promise<void> {
    await this.printOrPreview(buildInvoiceReceipt(inv, this.branchName()), `Comprobante — ${inv.folio}`, 'Comprobante');
  }

  /**
   * Si QZ Tray está conectado, imprime en silencio. Si no (o si QZ falla),
   * abre la vista previa para imprimir con la impresora del navegador.
   */
  private async printOrPreview(html: string, title: string, kind: string): Promise<void> {
    if (this.printing.status() === 'connected') {
      try {
        await this.printing.printHtml(html);
        this.messages.add({ severity: 'success', summary: 'Impresión', detail: `${kind} enviado a QZ Tray.` });
        return;
      } catch {
        this.messages.add({ severity: 'warn', summary: 'QZ Tray', detail: 'Falló la impresión por QZ; mostrando vista previa.' });
      }
    }
    this.openPreview(html, title);
  }

  private openPreview(html: string, title: string): void {
    this.previewHtml = html;
    this.previewSrc.set(this.sanitizer.bypassSecurityTrustHtml(html));
    this.previewTitle.set(title);
    this.previewVisible = true;
  }

  printPreview(): void {
    this.printing.printViaBrowser(this.previewHtml);
  }

  async printPreviewQz(): Promise<void> {
    try {
      await this.printing.printHtml(this.previewHtml);
      this.messages.add({ severity: 'success', summary: 'Impresión', detail: 'Enviado a QZ Tray.' });
      this.previewVisible = false;
    } catch {
      this.messages.add({ severity: 'error', summary: 'QZ Tray', detail: 'No se pudo imprimir por QZ.' });
    }
  }
}
