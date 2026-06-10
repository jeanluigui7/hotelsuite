import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { FinanceApiService } from '../services/finance-api.service';
import type { Invoice, Sale } from '../services/finance.models';

const TYPE_OPTIONS = [
  { label: 'Boleta', value: 'BOLETA' },
  { label: 'Factura', value: 'FACTURA' },
];

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TooltipModule,
  ],
  template: `
    <section>
      <header class="cat-head">
        <div>
          <h1>Comprobantes</h1>
          <p class="muted">Boletas y facturas con desglose de IGV (18% incluido).</p>
        </div>
        @if (canCreate) { <p-button label="Emitir comprobante" icon="pi pi-file" (onClick)="openIssue()" /> }
      </header>

      <p-table [value]="items()" [loading]="loading()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Folio</th><th>Tipo</th><th>Cliente</th>
            <th style="width:7rem">Base</th><th style="width:7rem">IGV</th><th style="width:7rem">Total</th>
            <th style="width:8rem">Estado</th><th>PSE</th><th style="width:9rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td><strong>{{ row.folio }}</strong></td>
            <td>{{ row.type === 'BOLETA' ? 'Boleta' : 'Factura' }}</td>
            <td>{{ row.customerName }}<div class="muted small">{{ row.customerDoc }}</div></td>
            <td>{{ row.subtotal | number: '1.2-2' }}</td>
            <td>{{ row.taxAmount | number: '1.2-2' }}</td>
            <td>{{ row.total | number: '1.2-2' }}</td>
            <td><p-tag [value]="row.status === 'ISSUED' ? 'Emitido' : 'Anulado'" [severity]="row.status === 'ISSUED' ? 'success' : 'danger'" /></td>
            <td class="muted small">{{ row.providerStatus }}<br />{{ row.providerRef }}</td>
            <td class="cat-actions">
              @if (canCreate && row.status === 'ISSUED') {
                <p-button icon="pi pi-receipt" [text]="true" (onClick)="openNote(row)" pTooltip="Nota C/D" />
              }
              @if (canEdit && row.status === 'ISSUED') {
                <p-button icon="pi pi-ban" severity="danger" [text]="true" (onClick)="confirmVoid(row)" pTooltip="Anular" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="9" class="muted center">Sin comprobantes.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- Emitir -->
    <p-dialog [(visible)]="issueVisible" [modal]="true" [style]="{ width: '520px' }" header="Emitir comprobante">
      <div class="cat-form">
        <label>Tipo</label>
        <p-selectButton [options]="typeOptions" optionLabel="label" optionValue="value" [(ngModel)]="form.type" [allowEmpty]="false" />

        <label>Origen</label>
        <p-selectButton [options]="sourceOptions" optionLabel="label" optionValue="value" [(ngModel)]="source" [allowEmpty]="false" (onChange)="onSourceChange()" />
        @if (source === 'sale') {
          <label>Venta</label>
          <p-select [options]="sales()" [(ngModel)]="form.saleId" optionValue="id" placeholder="Seleccionar venta" styleClass="w-full" (onChange)="onSalePick()">
            <ng-template let-s pTemplate="item">{{ s.customerName ?? 'Venta' }} · {{ s.total | number: '1.2-2' }} · {{ s.createdAt | date: 'dd/MM HH:mm' }}</ng-template>
            <ng-template let-s pTemplate="selectedItem">{{ s.total | number: '1.2-2' }} · {{ s.createdAt | date: 'dd/MM HH:mm' }}</ng-template>
          </p-select>
        } @else {
          <label>Total (IGV incluido)</label>
          <p-inputNumber [(ngModel)]="form.total" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w-full" />
        }

        <div class="row">
          <div class="col"><label>Cliente</label><input pInputText [(ngModel)]="form.customerName" /></div>
          <div class="col"><label>Documento</label><input pInputText [(ngModel)]="form.customerDoc" /></div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="issueVisible = false" />
        <p-button label="Emitir" icon="pi pi-check" [loading]="saving()" (onClick)="issue()" />
      </ng-template>
    </p-dialog>

    <!-- Nota C/D -->
    <p-dialog [(visible)]="noteVisible" [modal]="true" [style]="{ width: '460px' }" header="Nota de Crédito / Débito">
      <div class="cat-form">
        <p class="muted">Comprobante: <strong>{{ noteInvoice?.folio }}</strong></p>
        <label>Tipo</label>
        <p-select [options]="noteTypes" optionLabel="label" optionValue="value" [(ngModel)]="noteForm.type" styleClass="w-full" />
        <label>Monto</label>
        <p-inputNumber [(ngModel)]="noteForm.total" mode="currency" currency="PEN" locale="es-PE" [min]="0" styleClass="w-full" />
        <label>Motivo</label>
        <input pInputText [(ngModel)]="noteForm.reason" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="noteVisible = false" />
        <p-button label="Emitir nota" icon="pi pi-check" [loading]="saving()" (onClick)="createNote()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`.small { font-size: 0.75rem; }`],
  styleUrls: ['../../settings/catalogs/catalog.styles.scss'],
})
export class InvoicesComponent implements OnInit {
  private readonly finance = inject(FinanceApiService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly items = signal<Invoice[]>([]);
  readonly sales = signal<Sale[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly typeOptions = TYPE_OPTIONS;
  readonly sourceOptions = [
    { label: 'Desde venta', value: 'sale' },
    { label: 'Manual', value: 'manual' },
  ];
  readonly noteTypes = [
    { label: 'Nota de Crédito', value: 'CREDIT' },
    { label: 'Nota de Débito', value: 'DEBIT' },
  ];

  issueVisible = false;
  source: 'sale' | 'manual' = 'sale';
  form = { type: 'BOLETA' as 'BOLETA' | 'FACTURA', saleId: null as string | null, total: null as number | null, customerName: '', customerDoc: '' };

  noteVisible = false;
  noteInvoice: Invoice | null = null;
  noteForm = { type: 'CREDIT' as 'CREDIT' | 'DEBIT', total: null as number | null, reason: '' };

  readonly canCreate = this.auth.can('finance', 'create');
  readonly canEdit = this.auth.can('finance', 'edit');

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.finance.listInvoices({ pageSize: 100, sortBy: 'issuedAt', sortDir: 'desc' }).subscribe({
      next: (res) => { this.items.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openIssue(): void {
    this.form = { type: 'BOLETA', saleId: null, total: null, customerName: '', customerDoc: '' };
    this.source = 'sale';
    this.finance.listSales({ pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' }).subscribe((res) => this.sales.set(res.data ?? []));
    this.issueVisible = true;
  }

  onSourceChange(): void {
    this.form.saleId = null;
    this.form.total = null;
  }

  onSalePick(): void {
    const s = this.sales().find((x) => x.id === this.form.saleId);
    if (s && !this.form.customerName) this.form.customerName = s.customerName ?? 'Cliente';
  }

  issue(): void {
    if (!this.form.customerName) {
      this.messages.add({ severity: 'warn', summary: 'Falta cliente', detail: 'Ingresa el nombre del cliente.' });
      return;
    }
    if (this.source === 'sale' && !this.form.saleId) {
      this.messages.add({ severity: 'warn', summary: 'Falta venta', detail: 'Selecciona la venta.' });
      return;
    }
    if (this.source === 'manual' && !this.form.total) {
      this.messages.add({ severity: 'warn', summary: 'Falta total', detail: 'Ingresa el total.' });
      return;
    }
    const dto = {
      type: this.form.type,
      customerName: this.form.customerName,
      customerDoc: this.form.customerDoc || undefined,
      saleId: this.source === 'sale' ? this.form.saleId : null,
      total: this.source === 'manual' ? (this.form.total ?? undefined) : undefined,
    };
    this.saving.set(true);
    this.finance.issueInvoice(dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.issueVisible = false;
        this.messages.add({ severity: 'success', summary: 'Emitido', detail: 'Comprobante emitido.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo emitir.' });
      },
    });
  }

  openNote(inv: Invoice): void {
    this.noteInvoice = inv;
    this.noteForm = { type: 'CREDIT', total: Number(inv.total), reason: '' };
    this.noteVisible = true;
  }

  createNote(): void {
    if (!this.noteInvoice || !this.noteForm.total || !this.noteForm.reason) {
      this.messages.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Monto y motivo requeridos.' });
      return;
    }
    this.saving.set(true);
    this.finance.createNote({ invoiceId: this.noteInvoice.id, type: this.noteForm.type, reason: this.noteForm.reason, total: this.noteForm.total }).subscribe({
      next: () => {
        this.saving.set(false);
        this.noteVisible = false;
        this.messages.add({ severity: 'success', summary: 'Nota emitida', detail: 'Nota registrada.' });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo emitir la nota.' });
      },
    });
  }

  confirmVoid(inv: Invoice): void {
    this.confirm.confirm({
      header: 'Anular comprobante',
      message: `¿Anular ${inv.folio}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.finance.voidInvoice(inv.id).subscribe({
          next: () => { this.messages.add({ severity: 'success', summary: 'Anulado', detail: 'Comprobante anulado.' }); this.reload(); },
          error: (err: HttpErrorResponse) => this.messages.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'No se pudo anular.' }),
        });
      },
    });
  }
}
